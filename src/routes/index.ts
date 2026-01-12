import Koa, { Context } from 'koa';
import Router from '@koa/router';
import { registerMistralRoutes } from './mistralai';

/**
 * 首页欢迎路由处理函数
 * @param {Context} ctx Koa上下文
 * @returns {void}
 */
function rootHandler(ctx: Context): void {
    ctx.body = { message: 'Welcome to kelly' };
}

/**
 * 注册基础路由
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */
export function registerRoutes(app: Koa): void {
    const router = new Router();

    router.get('/', rootHandler);

    registerMistralRoutes(router);

    app.use(router.routes());
    app.use(router.allowedMethods());
}