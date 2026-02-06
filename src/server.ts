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

  // 优雅停机逻辑
  const gracefulShutdown = (signal: string) => {
    console.log(`\nReceived ${signal}. Closing server...`);
    
    // 停止接收新请求
    server.close(() => {
      console.log('Http server closed.');
      // 这里可以添加关闭数据库连接、Redis 连接等清理逻辑
      process.exit(0);
    });

    // 如果 10秒内还没关掉，强制退出
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer(port);