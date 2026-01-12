import Koa, { Context } from 'koa';
import bodyParser from 'koa-bodyparser';

/**
 * 创建错误处理中间件
 * @returns {(ctx: Context, next: Function) => Promise<void>} 错误处理中间件函数
 */
function createErrorHandlerMiddleware(): (ctx: Context, next: () => Promise<void>) => Promise<void> {
    return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        try {
            await next();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Internal Server Error';
            ctx.status = (err as any)?.status ?? 500;
            ctx.body = { message };
            ctx.app.emit('error', err as unknown, ctx);
        }
    };
}

/**
 * 注册应用级错误事件
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */
function registerErrorEvent(app: Koa): void {
    app.on('error', (err) => {
        if (process.env.NODE_ENV !== 'test') {
            console.error('Unhandled error:', err instanceof Error ? err.message : String(err));
        }
    });
}

/**
 * 创建访问日志中间件
 * @returns {(ctx: Context, next: Function) => Promise<void>} 日志中间件函数
 */
function createRequestLoggerMiddleware(): (ctx: Context, next: () => Promise<void>) => Promise<void> {
    return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        console.log(`${ctx.method} ${ctx.url} -> ${ctx.status} ${ms}ms`);
    };
}

/**
 * 注册通用中间件（错误处理、请求体解析、访问日志）
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */
export function registerMiddlewares(app: Koa): void {
    app.use(createErrorHandlerMiddleware());
    registerErrorEvent(app);
    app.use(bodyParser());
    app.use(createRequestLoggerMiddleware());
}