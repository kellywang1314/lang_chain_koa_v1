import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { Context } from 'koa';

export const dashScopeBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const dashScopeApiV1BaseUrl = 'https://dashscope.aliyuncs.com/api/v1';

/**
 * 获取 DashScope API Key（自动去除两侧引号与空格）
 * @returns {string} 可用的 DashScope API Key
 */
export function getDashScopeApiKey(): string {
    const rawKey = process.env.DASHSCOPE_API_KEY ?? '';
    const apiKey = rawKey.trim().replace(/^['"]|['"]$/g, '');
    if (!apiKey) {
        throw Object.assign(new Error('缺少 DASHSCOPE_API_KEY 环境变量'), { status: 500 });
    }
    return apiKey;
}

const dashScopeClient = new OpenAI({
    apiKey: getDashScopeApiKey(),
    baseURL: dashScopeBaseUrl,
});

/**
 * 获取 DashScope 的 OpenAI 兼容客户端（单例）
 * @returns {OpenAI} OpenAI SDK 客户端实例
 */
export function getDashScopeClient(): OpenAI {
    return dashScopeClient;
}

/**
 * 创建用于 LangChain 的千问聊天模型（通过 DashScope 兼容接口）
 * @param {{model?: string; temperature?: number; enableSearch?: boolean}} options 可选参数
 * @returns {ChatOpenAI} 可直接用于 createAgent 的 ChatOpenAI 实例
 */
// - 角色 ：它是 Agent 的 主模型（Brain） 。
// - 作用 ：负责 理解 用户问题、 决定 是否调用工具、以及最后 组织语言 回答用户。
// - 为什么它也需要 API Key？ 因为它本质上也是调 DashScope 的 LLM（qwen-plus）来做思考和推理。
export function createDashScopeChatModel(options: { model?: string; temperature?: number; enableSearch?: boolean } = {}): ChatOpenAI {
    const model = options.model ?? 'qwen-plus';
    const temperature = options.temperature ?? 0;
    const enableSearch = options.enableSearch ?? false;

    return new ChatOpenAI({
        apiKey: getDashScopeApiKey(),
        model,
        temperature,
        modelKwargs: enableSearch ? { enable_search: true } : undefined,
        configuration: {
            baseURL: dashScopeBaseUrl,
        },
    });
}

/**
 * 从 Koa ctx 中读取 request body
 * @param {Context} ctx Koa上下文
 * @returns {Record<string, any>} request body（默认返回空对象）
 */
export function getKoaRequestBody(ctx: Context): Record<string, any> {
    return ((ctx.request as any).body ?? {}) as Record<string, any>;
}

/**
 * 从 body 中读取必填字符串字段（并做 trim）
 * @param {Record<string, any>} body 请求体
 * @param {string} key 字段名
 * @param {string} message 缺失时的错误信息
 * @returns {string} 解析后的字符串
 */
export function getRequiredBodyString(body: Record<string, any>, key: string, message: string): string {
    const value: unknown = body[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw Object.assign(new Error(message), { status: 400 });
    }
    return value.trim();
}

/**
 * 从 body 中读取可选字符串字段
 * @param {Record<string, any>} body 请求体
 * @param {string} key 字段名
 * @returns {string | undefined} 解析后的字符串
 */
export function getOptionalBodyString(body: Record<string, any>, key: string): string | undefined {
    const value: unknown = body[key];
    return typeof value === 'string' ? value : undefined;
}

/**
 * 从 body 中读取可选数字字段
 * @param {Record<string, any>} body 请求体
 * @param {string} key 字段名
 * @returns {number | undefined} 解析后的数字
 */
export function getOptionalBodyNumber(body: Record<string, any>, key: string): number | undefined {
    const value: unknown = body[key];
    return typeof value === 'number' ? value : undefined;
}

/**
 * 从 body 中读取可选枚举字段
 * @template T
 * @param {Record<string, any>} body 请求体
 * @param {string} key 字段名
 * @param {readonly T[]} allowed 允许的枚举值
 * @returns {T | undefined} 解析后的枚举值
 */
export function getOptionalBodyEnum<T extends string>(body: Record<string, any>, key: string, allowed: readonly T[]): T | undefined {
    const value: unknown = body[key];
    if (typeof value !== 'string') return undefined;
    return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * 设置 Koa JSON 响应
 * @param {Context} ctx Koa上下文
 * @param {number} status HTTP状态码
 * @param {unknown} body 响应体
 * @returns {void}
 */
export function setKoaJson(ctx: Context, status: number, body: unknown): void {
    ctx.status = status;
    (ctx as any).body = body;
}

/**
 * 统一处理 Koa handler 的错误响应
 * @param {Context} ctx Koa上下文
 * @param {unknown} err 捕获到的错误
 * @param {string} fallbackMessage 未知错误时的兜底文案
 * @returns {void}
 */
export function setKoaError(ctx: Context, err: unknown, fallbackMessage: string): void {
    const message = err instanceof Error ? err.message : fallbackMessage;
    const status = (err as any)?.status ?? 500;
    setKoaJson(ctx, status, { message });
}

export async function dashScopePostJson<T = any>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const apiKey = getDashScopeApiKey();
    const url = `${dashScopeApiV1BaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(headers ?? {}),
        },
        body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
        throw Object.assign(new Error(`DashScope 调用失败: ${res.status} ${raw}`), { status: res.status });
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        throw Object.assign(new Error(`DashScope 返回非 JSON: ${raw}`), { status: 502 });
    }
}

export async function dashScopeGetJson<T = any>(path: string, headers?: Record<string, string>): Promise<T> {
    const apiKey = getDashScopeApiKey();
    const url = `${dashScopeApiV1BaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(headers ?? {}),
        },
    });
    const raw = await res.text();
    if (!res.ok) {
        throw Object.assign(new Error(`DashScope 调用失败: ${res.status} ${raw}`), { status: res.status });
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        throw Object.assign(new Error(`DashScope 返回非 JSON: ${raw}`), { status: 502 });
    }
}