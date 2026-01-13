import Koa, { Context } from 'koa';
import bodyParser from 'koa-bodyparser';
import fs from 'node:fs';
import path from 'node:path';

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

function getContentTypeByExt(ext: string): string {
    switch (ext.toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        case '.svg':
            return 'image/svg+xml';
        case '.ico':
            return 'image/x-icon';
        default:
            return 'application/octet-stream';
    }
}

async function findFirstExistingFilePath(candidatePaths: string[]): Promise<string | null> {
    for (const filePath of candidatePaths) {
        try {
            const stat = await fs.promises.stat(filePath);
            if (stat.isFile()) return filePath;
        } catch {
        }
    }
    return null;
}

function createStaticImagesMiddleware(): (ctx: Context, next: () => Promise<void>) => Promise<void> {
    const rootCandidates = [
        path.join(process.cwd(), 'src', 'images'),
        path.join(process.cwd(), 'dist', 'images'),
        path.join(__dirname, 'images'),
    ];

    return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        if ((ctx.method !== 'GET' && ctx.method !== 'HEAD') || !ctx.path.startsWith('/images/')) {
            await next();
            return;
        }

        const requestedPath = ctx.path.slice('/images/'.length);
        const safeRelative = requestedPath.replace(/^\/+/, '');
        if (!safeRelative || safeRelative.includes('..')) {
            ctx.status = 400;
            ctx.body = { message: 'Invalid image path' };
            return;
        }

        const candidatePaths = rootCandidates.map((root) => path.join(root, safeRelative));
        const filePath = await findFirstExistingFilePath(candidatePaths);
        if (!filePath) {
            await next();
            return;
        }

        ctx.set('Content-Type', getContentTypeByExt(path.extname(filePath)));
        ctx.set('Cache-Control', 'public, max-age=3600');
        ctx.body = fs.createReadStream(filePath);
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
    app.use(createStaticImagesMiddleware());
    app.use(bodyParser());
    app.use(createRequestLoggerMiddleware());
}