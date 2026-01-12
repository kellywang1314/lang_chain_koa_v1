import Koa, { Context } from 'koa';
import Router from '@koa/router';

/**
 * 首页欢迎路由处理函数
 * @param {Context} ctx Koa上下文
 * @returns {void}
 */
function rootHandler(ctx: Context): void {
    ctx.body = { message: 'Welcome to kelly' };
}

/**
 * 健康检查路由处理函数
 * @param {Context} ctx Koa上下文
 * @returns {void}
 */
function healthHandler(ctx: Context): void {
    ctx.status = 200;
    ctx.body = { status: 'ok', timestamp: Date.now() };
}

/**
 * 回显请求体示例路由处理函数
 * @param {Context} ctx Koa上下文
 * @returns {void}
 */
function echoHandler(ctx: Context): void {
    const payload = (ctx.request as any).body ?? null;
    ctx.status = 200;
    ctx.body = { received: payload };
}

/**
 * 注册基础路由
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */
export function registerRoutes(app: Koa): void {
    const router = new Router();

    router.get('/', rootHandler);
    router.get('/health', healthHandler);
    router.post('/echo', echoHandler);

    app.use(router.routes());
    app.use(router.allowedMethods());
}