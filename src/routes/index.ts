import Koa, { Context } from 'koa';
import Router from '@koa/router';
import { registerMistralRoutes } from './mistral/translate';
import { registerMetasoRoutes } from './metaso/search';
import { registerDashScopeWebSearchRoutes } from './dashscope/webSearch';
import { registerDashScopeImageRoutes } from './dashscope/imageRead';
import { registerDashScopeTranslateRoutes } from './dashscope/translate';
import { registerDashScopeChatRoutes } from './dashscope/chat';
import { registerDashScopeRagRoutes } from './dashscope/rag';

/**
 * 注册基础路由
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */
export function registerRoutes(app: Koa): void {
    const router = new Router();
    registerMistralRoutes(router);
    registerMetasoRoutes(router);
    registerDashScopeImageRoutes(router);
    registerDashScopeWebSearchRoutes(router);
    registerDashScopeTranslateRoutes(router);
    registerDashScopeChatRoutes(router);
    registerDashScopeRagRoutes(router);
    app.use(router.routes());
    app.use(router.allowedMethods());
}