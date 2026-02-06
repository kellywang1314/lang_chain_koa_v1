import Koa from 'koa';
import { registerMiddlewares } from './middleware';
import { registerRoutes } from './routes';
import { patchArrayToReversed } from './utils/index';
patchArrayToReversed();
/**
 * 创建并返回Koa应用实例
 * @returns {Koa} Koa应用实例
 */
function createServer(): Koa {
  const app = new Koa();
  return app;
}

/**
 * 注册通用中间件（错误处理、请求体解析、访问日志）
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */

/**
 * 注册基础路由
 * @param {Koa} app Koa应用实例
 * @returns {void}
 */


// 启动流程
const app = createServer();
registerMiddlewares(app);
registerRoutes(app);

const port = Number(process.env.PORT ?? 3000);

/**
 * 启动HTTP服务
 * @param {number} listenPort 监听端口
 * @returns {void}
 */
function startServer(listenPort: number): void {
  const server = app.listen(listenPort, () => {
    console.log(`Koa TS server listening on http://localhost:${listenPort}`);
  });

}

startServer(port);