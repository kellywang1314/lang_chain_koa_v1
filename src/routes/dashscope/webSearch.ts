import Router from '@koa/router';
import { Context } from 'koa';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';

import {
    createDashScopeChatModel,
    getDashScopeClient,
    getKoaRequestBody,
    getOptionalBodyNumber,
    getOptionalBodyString,
    getRequiredBodyString,
    setKoaError,
    setKoaJson,
} from '../../utils/dashscope';

const dashscopeClient = getDashScopeClient();

/**
 * 调用DashScope API进行网络搜索
 * @param {string} query 搜索查询
 * @param {{model?: string; max_tokens?: number; temperature?: number}} options 可选配置
 * @returns {Promise<string>} 返回API响应内容
 */
async function callDashScopeWebSearch(
    query: string,
    options: { model?: string; max_tokens?: number; temperature?: number } = {}
): Promise<string> {
    const model = options.model ?? 'qwen-plus';

    const requestBody: any = {
        model,
        messages: [{ role: 'user', content: query }],
        enable_search: true,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
    };

    const response = await dashscopeClient.chat.completions.create(requestBody, {
        headers: {
            'Content-Type': 'application/json',
            'X-DashScope-Parameters': JSON.stringify({
                enable_search: true,
            }),
        },
    });

    return response.choices[0]?.message?.content ?? '';
}

/**
 * 创建DashScope网络搜索工具
 * @param {{model?: string; max_tokens?: number; temperature?: number}} defaults 默认配置
 * @returns 已配置的工具函数
 */
function createDashScopeWebSearchTool(defaults: { model?: string; max_tokens?: number; temperature?: number }) {
    return tool(
        async (input: { query: string; model?: string; max_tokens?: number; temperature?: number }) => {
            const result = await callDashScopeWebSearch(input.query, {
                model: input.model ?? defaults.model,
                max_tokens: input.max_tokens ?? defaults.max_tokens,
                temperature: input.temperature ?? defaults.temperature,
            });
            return result;
        },
        {
            name: 'dashscope_web_search',
            description: '使用阿里通义千问 API 进行联网搜索。当需要查询实时信息、新闻或网页内容时调用。',
            schema: z.object({
                query: z.string().describe('搜索关键词或自然语言问题'),
                model: z.string().optional().describe('要使用的模型名称，默认为 qwen-plus'),
                max_tokens: z.number().optional().describe('最大生成token数'),
                temperature: z.number().optional().describe('温度参数，控制生成随机性'),
            }),
        }
    );
}

/**
 * DashScope网络搜索处理器
 * @param {Context} ctx Koa上下文
 * @returns {Promise<void>}
 */
export async function dashScopeWebSearchHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const input = getRequiredBodyString(body, 'input', '缺少必要参数：input（string）');
        const model = getOptionalBodyString(body, 'model');
        const maxTokens = getOptionalBodyNumber(body, 'max_tokens');
        const temperature = getOptionalBodyNumber(body, 'temperature');

        const dashscopeTool = createDashScopeWebSearchTool({
            model,
            max_tokens: maxTokens,
            temperature,
        });

        const agent = createAgent({
            model: createDashScopeChatModel({
                model: model ?? 'qwen-plus',
                temperature: 0,
                enableSearch: true,
            }),
            tools: [dashscopeTool],
            systemPrompt: '你是一名检索助手。优先使用工具检索最新信息，再基于工具返回结果回答。回答用中文，最多引用3个来源链接；若信息不足请明确说明。',
        });

        const finalState = await agent.invoke({
            messages: [{ role: 'user', content: input }],
        });

        const messages = (finalState as any)?.messages ?? [];

        let agentOutput = '';
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const msg = messages[i];
            const msgType = typeof msg?._getType === 'function' ? msg._getType() : msg?.type ?? msg?.role;
            if (msgType === 'ai' || msgType === 'assistant') {
                const content = msg?.content;
                if (typeof content === 'string') {
                    agentOutput = content;
                } else if (Array.isArray(content)) {
                    agentOutput = content
                        .map((block: any) => (typeof block === 'string' ? block : typeof block?.text === 'string' ? block.text : ''))
                        .join('');
                } else {
                    agentOutput = content == null ? '' : String(content);
                }
                break;
            }
        }

        setKoaJson(ctx, 200, {
            query: input,
            agentOutput,
            model: model ?? 'qwen-plus',
        });
    } catch (err) {
        setKoaError(ctx, err, '代理搜索失败');
    }
}

/**
 * 注册DashScope联网搜索路由
 * @param {Router} router Koa路由器实例
 * @returns {void}
 */
export function registerDashScopeWebSearchRoutes(router: Router): void {
    router.post('/dashscope/web-search', dashScopeWebSearchHandler);
}

// 接口测试入参
// {
//     "input": "搜索电视剧何以笙萧默主题曲",
//     "model": "qwen-plus",
//     "max_tokens": 512,
//     "temperature": 0
// }
