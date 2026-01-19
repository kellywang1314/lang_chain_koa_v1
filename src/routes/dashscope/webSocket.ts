import type { Server as HttpServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

import { getDashScopeClient } from '../../utils/dashscope';

type ClientMessage = {
    id?: string;
    input?: string;
    model?: string;
    enableSearch?: boolean;
    temperature?: number;
    maxTokens?: number;
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
};

type ServerMessage =
    | { type: 'ready' }
    | { type: 'start'; id: string }
    | { type: 'delta'; id: string; content: string }
    | { type: 'end'; id: string }
    | { type: 'error'; id?: string; message: string };

/**
 * 安全解析 JSON 字符串
 * @param {string} text 原始文本
 * @returns {unknown} 解析结果；失败时返回 null
 */
function safeJsonParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * 向 WebSocket 客户端发送 JSON 消息
 * @param {WebSocket} ws 客户端连接
 * @param {ServerMessage} payload 消息体
 * @returns {void}
 */
function sendJson(ws: WebSocket, payload: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
}

/**
 * 将客户端消息转换为 DashScope chat.completions 所需的 messages
 * @param {ClientMessage} msg 客户端消息
 * @returns {Array<{ role: 'system' | 'user' | 'assistant'; content: string }>} 标准 messages
 */
function buildRequestMessages(msg: ClientMessage): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    if (Array.isArray(msg.messages) && msg.messages.length > 0) {
        return msg.messages
            .filter((m) => m && (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content }));
    }

    const input = typeof msg.input === 'string' ? msg.input.trim() : '';
    return [{ role: 'user', content: input }];
}

/**
 * 注册 DashScope 实时问答 WebSocket 服务
 *
 * 协议说明：
 * - 连接地址：`ws://<host>:<port>/ws/dashscope-agent`
 * - 客户端发送：`{ id?, input?, messages?, model?, enableSearch?, temperature?, maxTokens? }`
 * - 服务端推送：
 *   - `ready`：连接建立
 *   - `start`：一次请求开始
 *   - `delta`：流式增量 token
 *   - `end`：一次请求结束
 *   - `error`：错误信息
 *
 * 关键行为：
 * - 同一连接内新请求会取消旧请求（AbortController）
 *
 * @param {HttpServer} server 现有 HTTP Server 实例
 * @returns {void}
 */
export function registerDashScopeAgentWebSocket(server: HttpServer): void {
    const wss = new WebSocketServer({
        server,
        path: '/ws/dashscope-agent',
    });

    const dashscopeClient = getDashScopeClient();

    wss.on('connection', (ws) => {
        let activeController: AbortController | null = null;

        ws.on('close', () => {
            if (activeController) activeController.abort();
            activeController = null;
        });

        ws.on('message', async (data) => {
            const raw = typeof data === 'string' ? data : data.toString('utf8');

            // 1) 解析客户端 JSON 消息（协议要求：message 必须是 JSON 对象）
            const parsed = safeJsonParse(raw);
            if (!parsed || typeof parsed !== 'object') {
                sendJson(ws, { type: 'error', message: '消息必须是 JSON 对象' });
                return;
            }

            const msg = parsed as ClientMessage;

            // 2) 生成一次请求的 id（用于前端把 start/delta/end 关联到同一次提问）
            const requestId = typeof msg.id === 'string' && msg.id.trim() ? msg.id.trim() : `${Date.now()}`;

            // 3) 将入参转换为 DashScope chat.completions 所需的 messages
            const requestMessages = buildRequestMessages(msg);
            if (!requestMessages.length || !requestMessages[0]?.content?.trim()) {
                sendJson(ws, { type: 'error', id: requestId, message: '缺少必要参数：input（string）或 messages（array）' });
                return;
            }

            // 4) 同一连接内：新请求到来时取消旧请求，避免“多次提问并发返回”导致前端串流混乱
            if (activeController) activeController.abort();
            activeController = new AbortController();

            // 5) 读取可选参数（未传则使用默认值）
            const model = typeof msg.model === 'string' && msg.model.trim() ? msg.model.trim() : 'qwen-plus';
            const enableSearch = msg.enableSearch !== false;
            const temperature = typeof msg.temperature === 'number' ? msg.temperature : 0;
            const maxTokens = typeof msg.maxTokens === 'number' ? msg.maxTokens : undefined;

            // 6) 通知前端：本次请求开始
            sendJson(ws, { type: 'start', id: requestId });

            try {
                // 7) 构造 DashScope 请求体：开启 stream，后续按 token 增量返回
                const requestBody: any = {
                    model,
                    messages: requestMessages,
                    stream: true, // 开启流式返回
                    temperature,
                    max_tokens: maxTokens,
                };
                if (enableSearch) requestBody.enable_search = true;

                // 8) 发起流式请求；当连接关闭/新请求到来，会通过 AbortController 终止
                const stream = await dashscopeClient.chat.completions.create(requestBody, {
                    signal: activeController.signal,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                // 9) 将上游的流式 delta 转发给前端（前端可把 delta 拼成完整答案）
                for await (const chunk of stream as any) {
                    if (ws.readyState !== WebSocket.OPEN) break;
                    const delta = chunk?.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        sendJson(ws, { type: 'delta', id: requestId, content: delta });
                    }
                }

                // 10) 通知前端：本次请求结束
                sendJson(ws, { type: 'end', id: requestId });
            } catch (err) {
                // 11) 统一错误通知（包括鉴权/限流/上游异常/主动 abort 等）
                const message = err instanceof Error ? err.message : '实时问答失败';
                sendJson(ws, { type: 'error', id: requestId, message });
            }
        });

        sendJson(ws, { type: 'ready' });
    });
}