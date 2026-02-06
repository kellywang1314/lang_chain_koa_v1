import Koa, { Context } from 'koa';
import Router from '@koa/router';
import { registerMistralRoutes } from './mistral/translate';
import { registerMetasoRoutes } from './metaso/search';
import { registerDashScopeWebSearchRoutes } from './dashscope/webSearch';
import { registerDashScopeImageRoutes } from './dashscope/imageRead';
import { registerDashScopeTranslateRoutes } from './dashscope/translate';
import { registerDashScopeChatRoutes } from './dashscope/chat';
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
    router.get('/__debug/routes', (ctx: Context) => {
        ctx.body = (router as any).stack?.map((layer: any) => ({
            path: layer?.path,
            methods: layer?.methods,
            name: layer?.name,
        })) ?? [];
    });

    registerMistralRoutes(router);
    registerMetasoRoutes(router);
    registerDashScopeImageRoutes(router);
    registerDashScopeWebSearchRoutes(router);
    registerDashScopeTranslateRoutes(router);
    registerDashScopeChatRoutes(router);



    app.use(router.routes());
    app.use(router.allowedMethods());
}