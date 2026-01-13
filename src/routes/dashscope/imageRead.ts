import Router from '@koa/router';
import { Context } from 'koa';

import {
    getDashScopeClient,
    getKoaRequestBody,
    getOptionalBodyNumber,
    getOptionalBodyString,
    setKoaError,
    setKoaJson,
} from '../../utils/dashscope';

const dashscopeClient = getDashScopeClient();

type DashScopeVisionModel = 'qwen-vl-plus' | 'qwen-vl-max' | string;

type ImageReadOptions = {
    model?: DashScopeVisionModel;
    max_tokens?: number;
    temperature?: number;
};

function buildImageUrlFromBase64(base64: string, mimeType?: string): string {
    const mt = (mimeType && typeof mimeType === 'string' ? mimeType : 'image/png').trim();
    const b64 = base64.trim().replace(/^data:[^;]+;base64,/, '');
    return `data:${mt};base64,${b64}`;
}

function isLocalhostUrl(url: URL): boolean {
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const raw = await res.arrayBuffer();
    if (!res.ok) {
        throw Object.assign(new Error(`读取图片失败: ${res.status} ${url}`), { status: 502 });
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const base64 = Buffer.from(raw).toString('base64');
    return buildImageUrlFromBase64(base64, contentType);
}

async function normalizeImageUrlForDashScope(ctx: Context, imageUrl: string): Promise<string> {
    const trimmed = imageUrl.trim();
    if (!trimmed) return trimmed;

    if (trimmed.startsWith('/')) {
        const absolute = `${ctx.origin}${trimmed}`;
        return await fetchImageAsDataUrl(absolute);
    }

    try {
        const url = new URL(trimmed);
        if (isLocalhostUrl(url)) {
            return await fetchImageAsDataUrl(url.toString());
        }
    } catch {
    }

    return trimmed;
}

async function callDashScopeImageRead(imageUrl: string, question: string, options: ImageReadOptions = {}): Promise<string> {
    const requestBody: any = {
        model: options.model ?? 'qwen-vl-plus',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: question },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ],
            },
        ],
        max_tokens: options.max_tokens,
        temperature: options.temperature,
    };

    const response = await dashscopeClient.chat.completions.create(requestBody, {
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const content = response.choices?.[0]?.message?.content as any;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content?.map((block: any) => (typeof block === 'string' ? block : typeof block?.text === 'string' ? block.text : ''))
            .join('');
    }
    return content == null ? '' : String(content);
}

/**
 * DashScope图片读取（理解）处理器
 * @param {Context} ctx Koa上下文
 * @returns {Promise<void>}
 */
export async function dashScopeImageReadHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);

        const imageUrlRaw =
            getOptionalBodyString(body, 'imageUrl') ??
            getOptionalBodyString(body, 'image_url') ??
            getOptionalBodyString(body, 'url');
        const imageBase64 =
            getOptionalBodyString(body, 'imageBase64') ??
            getOptionalBodyString(body, 'image_base64') ??
            getOptionalBodyString(body, 'base64');
        const imageMimeType =
            getOptionalBodyString(body, 'imageMimeType') ??
            getOptionalBodyString(body, 'mimeType') ??
            getOptionalBodyString(body, 'mime_type');

        const question =
            (getOptionalBodyString(body, 'question') ??
                getOptionalBodyString(body, 'prompt') ??
                getOptionalBodyString(body, 'input') ??
                '').trim() || '请描述这张图片的内容。';

        const model = getOptionalBodyString(body, 'model');
        const maxTokens = getOptionalBodyNumber(body, 'max_tokens');
        const temperature = getOptionalBodyNumber(body, 'temperature');

        let imageUrl: string | undefined;
        if (imageUrlRaw && imageUrlRaw.trim()) {
            imageUrl = await normalizeImageUrlForDashScope(ctx, imageUrlRaw);
        } else if (imageBase64 && imageBase64.trim()) {
            imageUrl = buildImageUrlFromBase64(imageBase64, imageMimeType);
        }
        if (!imageUrl) {
            throw Object.assign(new Error('缺少必要参数：imageUrl（string）或 imageBase64（string）'), { status: 400 });
        }

        const answer = await callDashScopeImageRead(imageUrl, question, {
            model: (model ?? 'qwen-vl-plus') as DashScopeVisionModel,
            max_tokens: maxTokens,
            temperature,
        });

        const answerLines = answer
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);

        setKoaJson(ctx, 200, {
            model: model ?? 'qwen-vl-plus',
            question,
            answer,
            answerLines,
        });
    } catch (err) {
        setKoaError(ctx, err, '图片读取失败');
    }
}


export function registerDashScopeImageRoutes(router: Router): void {
    router.post('/dashscope/image-read', dashScopeImageReadHandler);
}


// 测试接口
// {
//     "imageUrl": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg",
//     "question": "这张图里有什么？请用中文描述。",
//     "model": "qwen-vl-plus",
//     "max_tokens": 512,
//     "temperature": 0
// }

// {
//     "imageUrl": "http://localhost:3000/images/fe_code.jpg",
//     "question": "提取图片的文案",
//     "model": "qwen-vl-plus",
//     "max_tokens": 512,
//     "temperature": 0
// }