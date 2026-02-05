import Router from '@koa/router';
import { Context } from 'koa';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import {
    createDashScopeChatModel,
    getKoaRequestBody,
    getOptionalBodyString,
    getRequiredBodyString,
    setKoaError,
    setKoaJson,
} from '../../utils/dashscope';

/**
 * 翻译 Prompt 模板
 */
const translatePrompt = ChatPromptTemplate.fromMessages([
    ['system', '你是一名精通多国语言的专业翻译助手。请将以下内容翻译成{targetLanguage}。仅输出翻译后的结果，不要包含任何解释或额外文本。'],
    ['human', '{input}'],
]);

/**
 * DashScope 翻译处理器
 * @param {Context} ctx Koa上下文
 * @returns {Promise<void>}
 */
export async function dashScopeTranslateHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const input = getRequiredBodyString(body, 'input', '缺少必要参数：input（string）');
        const targetLanguage = getOptionalBodyString(body, 'targetLanguage') ?? '中文';
        const modelName = getOptionalBodyString(body, 'model');

        // 创建模型实例（默认使用 qwen-plus）
        const model = createDashScopeChatModel({
            model: modelName ?? 'qwen-plus',
            temperature: 0, // 翻译任务建议 temperature 为 0 以保证稳定性
        });

        // 构建 Chain: Prompt -> Model -> OutputParser
        const chain = translatePrompt.pipe(model).pipe(new StringOutputParser());

        // 执行翻译
        const result = await chain.invoke({
            input,
            targetLanguage,
        });

        setKoaJson(ctx, 200, {
            originalText: input,
            targetLanguage,
            translatedText: result,
            model: modelName ?? 'qwen-plus',
        });
    } catch (err) {
        setKoaError(ctx, err, '翻译失败');
    }
}

/**
 * 注册 DashScope 翻译路由
 * @param {Router} router Koa路由器实例
 * @returns {void}
 */
export function registerDashScopeTranslateRoutes(router: Router): void {
    router.post('/dashscope/translate', dashScopeTranslateHandler);
}