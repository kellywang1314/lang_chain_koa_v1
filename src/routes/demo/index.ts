import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { createAgent, tool } from 'langchain';
import fs from 'node:fs/promises';
import { z } from 'zod';
/**  1. 基础模块 **/
// 1.1 LLM 封装（统一模型入口）
export function createQwenChatModel(options?: { model?: string; temperature?: number }) {
    return new ChatOpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        model: options?.model ?? 'qwen-plus',
        temperature: options?.temperature ?? 0,
        configuration: {
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
    });
}


// 1.2 PromptTemplate
export const translatePrompt = ChatPromptTemplate.fromMessages([
    ['system', '你是翻译专家，把内容翻译成 {targetLanguage}，只输出结果。'],
    ['human', '{text}'],
]);


// 1.3 Chain（链式调用 = 异步流程管道）
export async function translate(text: string, targetLanguage: string) {
    const model = createQwenChatModel({ model: 'qwen-plus', temperature: 0 });
    const chain = translatePrompt.pipe(model).pipe(new StringOutputParser());
    return chain.invoke({ text, targetLanguage });
}

/**  2. Agent 核心 **/
/* 2.1 Agent 类型选择（优先掌握 zero-shot-react-description ）
 「zero-shot」：大模型不用提前学习 / 适配你的工具，仅靠自然语言描述就能理解工具用途；
 「react」：遵循Reason（思考）+ Act（行动） 核心范式，让 Agent 有逻辑地解决问题；(ReAct)
 「description」：Agent 的决策依据完全来自你给工具写的 description 字段（前端写接口文档的经验可直接复用）。
*/
function createWebSearchTool() {
    return tool(
        async (input: { query: string }) => {
            // 这里调用你已有的搜索接口即可（Metaso / DashScope enable_search, 核心就是封装调用模型api
            return JSON.stringify({ results: [{ title: '...', link: '...', snippet: '...' }] });
        },
        {
            name: 'web_search',
            description: '当问题需要最新信息时调用。输入 query，输出 results 列表 JSON。',
            schema: z.object({ query: z.string() }),
        }
    );
}

export async function askWithAgent(text: string, targetLanguage: string) {
    const agent = createAgent({
        model: createQwenChatModel({ model: 'qwen-plus', temperature: 0 }),
        tools: [createWebSearchTool()],
        systemPrompt: `你是翻译专家，把内容翻译成 ${targetLanguage}，只输出结果。`,
    });

    const state = await agent.invoke({ messages: [{ role: 'user', content: text }] });
    return state;
}


// 2.2 自定义tool, 区别于直接调用模型的api的tool
export function createLocalImageToBase64Tool() {
    return tool(
        async (input: { filePath: string; mimeType?: string }) => {
            const buf = await fs.readFile(input.filePath);
            const mime = input.mimeType ?? 'image/jpeg';
            const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
            return JSON.stringify({ dataUrl });
        },
        {
            name: 'local_image_to_base64',
            description: '读取本地图片文件并转成 dataURL（用于视觉模型输入）。',
            schema: z.object({
                filePath: z.string(),
                mimeType: z.string().optional(),
            }),
        }
    );
}

/* 3 记忆模块（Memory）实现 */
// 已迁移至 ./memory.ts，请从该文件导入使用
import { demoAllMemories } from './memory';
export { demoAllMemories };

