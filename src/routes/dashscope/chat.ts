import Router from '@koa/router';
import { Context } from 'koa';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';

import {
    createDashScopeChatModel,
    getKoaRequestBody,
    getOptionalBodyString,
    getRequiredBodyString,
    setKoaError,
    setKoaJson,
} from '../../utils/dashscope';

import {
    ConversationBufferWindowMemory,
} from '../../utils/memory';

// --- 全局 Memory Store (简单内存存储) ---
// 注意：生产环境应使用 Redis 代替
const memoryStore: Map<string, ConversationBufferWindowMemory> = new Map();

function getMemory(sessionId: string): ConversationBufferWindowMemory {
    if (!memoryStore.has(sessionId)) {
        memoryStore.set(sessionId, new ConversationBufferWindowMemory(10)); // 保留最近 10 轮
    }
    return memoryStore.get(sessionId)!;
}

// --- Handler ---

export async function dashScopeChatHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const input = getRequiredBodyString(body, 'input', '缺少必要参数：input（string）');
        const sessionId = getOptionalBodyString(body, 'sessionId') ?? 'default-session';
        const modelName = getOptionalBodyString(body, 'model');

        // 1. 获取 Memory
        const memory = getMemory(sessionId);

        // 2. 准备上下文 (System Prompt + History)
        const history = await memory.getMessages();
        const systemMessage = new SystemMessage('你是一个智能助手，能够记住我们之前的对话。请用简练的中文回答。');

        // 3. 构造本次请求的 Messages
        const messages = [systemMessage, ...history, new HumanMessage(input)];
        // 4. 调用模型
        const model = createDashScopeChatModel({
            model: modelName ?? 'qwen-plus',
            temperature: 0.7,
        });

        const response = await model.invoke(messages);
        const answer = typeof response.content === 'string' ? response.content : String(response.content);

        // 5. 更新 Memory (保存本轮对话)
        await memory.addUserMessage(input);
        await memory.addAiMessage(answer);

        setKoaJson(ctx, 200, {
            sessionId,
            input,
            answer,
            historyCount: history.length + 2, // 之前的 + 本次的一问一答
        });

    } catch (err) {
        setKoaError(ctx, err, '聊天失败');
    }
}

/**
 * 清除记忆接口
 */
export async function clearMemoryHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const sessionId = getRequiredBodyString(body, 'sessionId', '缺少必要参数：sessionId');

        if (memoryStore.has(sessionId)) {
            await memoryStore.get(sessionId)?.clear?.();
            memoryStore.delete(sessionId);
        }

        setKoaJson(ctx, 200, { message: `Session ${sessionId} 记忆已清除` });
    } catch (err) {
        setKoaError(ctx, err, '清除记忆失败');
    }
}

export function registerDashScopeChatRoutes(router: Router): void {
    router.post('/dashscope/chat', dashScopeChatHandler);
    router.post('/dashscope/chat/clear', clearMemoryHandler);
}