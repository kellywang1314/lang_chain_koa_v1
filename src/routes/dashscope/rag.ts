import Router from '@koa/router';
import { Context } from 'koa';
// import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import multer from '@koa/multer';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { LanceDB } from '@langchain/community/vectorstores/lancedb';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs';
import path from 'node:path';
import {
    createDashScopeChatModel,
    getDashScopeApiKey,
    getKoaRequestBody,
    getRequiredBodyString,
    setKoaError,
    setKoaJson,
    dashScopeBaseUrl,
} from '../../utils/dashscope';

// 配置上传
const upload = multer({ dest: 'uploads/' });
// --- 全局 Vector Store (内存版) ---
// 注意：生产环境应使用 Faiss / Milvus / PGVector 等持久化方案


/**
 * 初始化 Embedding 模型
 * 
 * 作用：将文本转换为向量（数字列表），用于计算文本之间的相似度。
 * 
 * 这里虽然使用的是 OpenAIEmbeddings 类，但通过配置：
 * 1. apiKey: 使用阿里云 DashScope 的 API Key
 * 2. baseURL: 指向 DashScope 的兼容接口
 * 3. modelName: 指定使用通义千问的文本向量模型 'text-embedding-v1'
 * 
 * 从而实现了用 OpenAI 的 SDK 调用阿里云的向量服务。
 */
const embeddings = new OpenAIEmbeddings({
    apiKey: getDashScopeApiKey(),
    modelName: 'text-embedding-v1', // DashScope 文本向量模型
    configuration: {
        baseURL: dashScopeBaseUrl,
    },
});



// --- LanceDB 持久化配置 ---
const LANCE_DB_PATH = path.join(process.cwd(), 'data/lancedb');

// 单例模式获取 VectorStore
let vectorStoreInstance: LanceDB | null = null;

async function getVectorStore(): Promise<LanceDB> {
    if (vectorStoreInstance) return vectorStoreInstance;

    // 确保目录存在
    if (!fs.existsSync(LANCE_DB_PATH)) {
        fs.mkdirSync(LANCE_DB_PATH, { recursive: true });
    }

    const db = await lancedb.connect(LANCE_DB_PATH);

    // 尝试打开表，如果不存在则创建（需要一个初始 schema 或 dummy data）
    let table: lancedb.Table;
    try {
        table = await db.openTable('vectors');
    } catch (e) {
        // 创建新表，必须提供初始数据来推断 Schema
        // 这里的 vector 维度必须与 Embedding 模型一致 (text-embedding-v1 是 1536 维)
        table = await db.createTable('vectors', [
            { id: 'init', vector: Array(1536).fill(0), text: 'init', metadata: '{}' }
        ]);
    }

    vectorStoreInstance = new LanceDB(embeddings, { table });
    return vectorStoreInstance;
}


/**
 * 添加文档到知识库
 * POST /dashscope/rag/add
 * Body: { "text": "...", "metadata": { ... } }
 */
export async function addDocumentHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const text = getRequiredBodyString(body, 'text', '缺少必要参数：text（string）');
        const metadata = (body.metadata as Record<string, any>) ?? {};

        const vectorStore = await getVectorStore();
        await vectorStore.addDocuments([
            new Document({ pageContent: text, metadata }),
        ]);

        setKoaJson(ctx, 200, { message: '文档已添加', textLength: text.length });
    } catch (err) {
        setKoaError(ctx, err, '添加文档失败');
    }
}


/**
 * 上传文件并建立索引
 * POST /dashscope/rag/upload
 * Content-Type: multipart/form-data
 * File: file
 */
export async function uploadDocumentHandler(ctx: Context): Promise<void> {
    try {
        const file = (ctx.request as any).file;
        if (!file) {
            setKoaError(ctx, new Error('未找到文件'), '请上传文件');
            return;
        }

        const filePath = file.path;
        const mimeType = file.mimetype;

        let docs: Document[] = [];

        // 根据文件类型加载
        if (mimeType === 'application/pdf') {
            const loader = new PDFLoader(filePath);
            docs = await loader.load();
        } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
            // 简单文本直接读取
            const content = await fs.promises.readFile(filePath, 'utf-8');
            docs = [new Document({ pageContent: content, metadata: { source: file.originalname } })];
        } else {
            throw new Error(`不支持的文件类型: ${mimeType}`);
        }

        // 文本切片 (Split)
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 50,
        });
        const splitDocs = await splitter.splitDocuments(docs);

        // 存入向量库
        const vectorStore = await getVectorStore();
        await vectorStore.addDocuments(splitDocs);

        // 清理临时文件
        await fs.promises.unlink(filePath);

        setKoaJson(ctx, 200, {
            message: '文件处理完成',
            fileName: file.originalname,
            chunks: splitDocs.length,
        });
    } catch (err) {
        setKoaError(ctx, err, '文件上传处理失败');
    }
}

/**
 * 基于知识库提问
 * POST /dashscope/rag/query
 * Body: { "query": "..." }
 */
export async function queryRagHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const query = getRequiredBodyString(body, 'query', '缺少必要参数：query（string）');

        // 1. 检索 (Retrieve)
        const vectorStore = await getVectorStore();
        // 查找最相似的 3 个片段
        const relevantDocs = await vectorStore.similaritySearch(query, 3);

        if (relevantDocs.length === 0) {
            setKoaJson(ctx, 200, { answer: '知识库中没有相关信息。', sources: [] });
            return;
        }

        const context = relevantDocs.map((d) => d.pageContent).join('\n\n');

        // 2. 生成 (Generate)
        const prompt = ChatPromptTemplate.fromTemplate(`
        你是一个智能助手。请基于以下提供的背景信息回答用户的问题。
        如果背景信息中没有答案，请直接说“我不知道”，不要编造。

        背景信息：
        {context}

        用户问题：{question}
        `);

        const model = createDashScopeChatModel({ temperature: 0 });
        const chain = prompt.pipe(model).pipe(new StringOutputParser());

        const answer = await chain.invoke({
            context,
            question: query,
        });

        setKoaJson(ctx, 200, {
            query,
            answer,
            sources: relevantDocs.map((d) => d.pageContent), // 返回引用来源，方便调试
        });

    } catch (err) {
        setKoaError(ctx, err, 'RAG 问答失败');
    }
}

export function registerDashScopeRagRoutes(router: Router): void {
    // 注册上传路由 (需要 multer 中间件)
    router.post('/dashscope/rag/upload', upload.single('file'), uploadDocumentHandler);
    router.post('/dashscope/rag/add', addDocumentHandler);
    router.post('/dashscope/rag/query', queryRagHandler);
}