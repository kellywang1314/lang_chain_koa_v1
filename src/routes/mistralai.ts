import Router from '@koa/router';
import { Context } from 'koa';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * 创建 Mistral Chat 模型实例
 * @param {string | undefined} modelName 指定模型名称（可选）
 * @param {number | undefined} temperature 采样温度（可选）
 * @returns {ChatMistralAI} Chat 模型实例
 */
function createMistralChat(modelName?: string, temperature?: number): ChatMistralAI {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw Object.assign(new Error('缺少 MISTRAL_API_KEY 环境变量'), { status: 500 });
    }
    return new ChatMistralAI({
        apiKey,
        model: modelName ?? (process.env.MISTRAL_MODEL ?? 'mistral-small-latest'),
        temperature: temperature ?? 0.2,
    });
}

/**
 * 构建翻译链
 * @param {ChatMistralAI} chatModel Mistral 聊天模型
 * @returns {any} 可执行的翻译链
 */
function createTranslateChain(chatModel: ChatMistralAI): any {
    const prompt = ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是一名专业的双语翻译。请将用户提供的文本精准翻译成指定的目标语言：{targetLanguage}。要求：1) 保留原文的语气、术语和专有名词；2) 不添加解释或额外内容；3) 只输出翻译结果（不包含任何前后缀）；4) 若原文已为目标语言，则进行适度润色但不改变含义。',
        ],
        ['human', '{text}'],
    ]);
    const parser = new StringOutputParser();
    return prompt.pipe(chatModel).pipe(parser);
}

/**
 * 翻译路由处理函数
 * @param {Context} ctx Koa 上下文
 * @returns {Promise<void>} 异步处理结果
 */
async function translateHandler(ctx: Context): Promise<void> {
    const body = (ctx.request as any).body ?? {};
    const text: unknown = body.text;
    const targetLanguage: unknown = body.targetLanguage ?? 'en';
    const modelName: unknown = body.model;
    const temperature: unknown = body.temperature;

    if (typeof text !== 'string' || !text.trim() || typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
        ctx.status = 400;
        ctx.body = { message: '缺少必要参数：text（string）与 targetLanguage（string）' };
        return;
    }

    try {
        const chat = createMistralChat(
            typeof modelName === 'string' ? modelName : undefined,
            typeof temperature === 'number' ? temperature : undefined,
        );

        const chain = createTranslateChain(chat);
        const result = await chain.invoke({ text, targetLanguage });

        ctx.status = 200;
        ctx.body = {
            translation: result,
            targetLanguage,
            model: typeof modelName === 'string' ? modelName : process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : '翻译失败';
        const status = (err as any)?.status ?? 500;
        ctx.status = status;
        ctx.body = { message };
    }
}

/**
 * 注册 Mistral 相关路由
 * @param {Router} router Koa Router 实例
 * @returns {void}
 */
export function registerMistralRoutes(router: Router): void {
    router.post('/mistral/translate', translateHandler);
}