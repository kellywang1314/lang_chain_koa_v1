import Router from '@koa/router';
import { Context } from 'koa';

import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';


/**
 * 调用秘塔 AI 搜索 API
 * @param {string} query 搜索关键词或自然语言查询
 * @param {object} options 可选项
 * @param {number} [options.num=5] 返回结果数量（1-10）
 * @returns {Promise<Array<{title: string; snippet: string; link: string; displayLink: string;}>>} 搜索结果列表
 */
async function callMetasoSearchApi(
  query: string,
  options: { num?: number } = {}
): Promise<Array<{ title: string; snippet: string; link: string; displayLink: string }>> {
  const rawKey = process.env.METASOL_API_KEY ?? '';
  const apiKey = rawKey.replace(/^['"]|['"]$/g, '');
  if (!apiKey) {
    throw Object.assign(new Error('缺少 METASOL_API_KEY 环境变量'), { status: 500 });
  }

  const size = Math.min(Math.max(options.num ?? 5, 1), 10);
  const body: Record<string, any> = {
    q: query,
    size,
    scope: 'webpage'
  };

  const url = 'https://metaso.cn/api/v1/search';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`秘塔搜索失败: ${res.status} ${raw}`), { status: 502 });
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error(`秘塔搜索返回非 JSON: ${raw}`), { status: 502 });
  }
  const webpages = Array.isArray((data as any).webpages) ? (data as any).webpages : null;
  return webpages?.map((item: any) => {
    const link = String(item.link ?? '');
    let displayLink = '';
    try {
      displayLink = link ? new URL(link).hostname : '';
    } catch {
      displayLink = '';
    }

    return {
      title: String(item.title ?? ''),
      snippet: String(item.snippet ?? ''),
      link,
      displayLink,
    };
  });
}

/**
 * 创建一个可被 LangChain Agent 调用的“秘塔搜索”工具。
 *
 * 约定：
 * - 输入为结构化参数（由 zod schema 校验）：{ query: string; num?: number }
 * - 输出为 JSON 字符串：{ results: Array<{ title; snippet; link; displayLink }> }
 *
 * 使用方式：
 * - 作为 createAgent({ tools: [...] }) 的 tools 成员传入
 * - Agent 会根据 tool 的 schema 生成 tool-call 参数
 *
 * @param {object} defaults 工具默认参数
 * @param {number} [defaults.num=5] 默认返回条数（1-10）
 * @returns {ReturnType<typeof tool>} 可被 Agent 调用的工具实例
 */
function createMetasoSearchTool(defaults: { num?: number }) {
  return tool(
    async (input: { query: string; num?: number }) => {
      const results = await callMetasoSearchApi(input.query, {
        num: input.num ?? defaults.num,
      });
      return JSON.stringify({ results });
    },
    // options 是“工具的元信息 + 入参约束”，给 Agent 用来 决定何时调用工具、怎么生成工具入参、以及如何校验入参 。
    {
      name: 'metaso_search',
      description:
        '使用秘塔 AI 搜索 API 检索网页。当需要查询实时信息、新闻或网页内容时调用。' +
        '输入参数为 query/num，输出为包含 title/snippet/link 的结果列表（JSON）。',
      schema: z.object({
        query: z.string(),
        num: z.number().int().min(1).max(10).optional(),
      }),
    }
  );
}

/**
 * 秘塔搜索代理路由处理函数
 * @param {Context} ctx Koa 上下文
 * @returns {Promise<void>} 异步处理结果
 */
export async function metasoSearchAgentHandler(ctx: Context): Promise<void> {
  const body = (ctx.request as any).body ?? {};
  const input: unknown = body.input;
  const num: unknown = body.num;
  const modelName: unknown = body.model;
  const temperature: unknown = body.temperature;

  if (typeof input !== 'string' || !input.trim()) {
    ctx.status = 400;
    ctx.body = { message: '缺少必要参数：input（string）' };
    return;
  }
  try {
    const llm = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY ?? '',
      model: typeof modelName === 'string' ? modelName : process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
      temperature: typeof temperature === 'number' ? temperature : 0,
    });

    const metasoTool = createMetasoSearchTool({
      num: typeof num === 'number' ? num : 5,
    });

    const agent = createAgent({
      model: llm,
      tools: [metasoTool],
      systemPrompt:
        '你是一名检索助手。优先使用工具检索最新信息，再基于工具返回结果回答。回答用中文，最多引用3个来源链接；若信息不足请明确说明。',
    });

    const finalState = await agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = (finalState as any)?.messages ?? [];

    let agentOutput = '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const msgType = typeof msg?._getType === 'function' ? msg._getType() : msg?.type ?? msg?.role;
      if (msgType === 'ai' || msgType === 'assistant') {
        const content = msg?.content;
        if (typeof content === 'string') {
          agentOutput = content;
        } else if (Array.isArray(content)) {
          agentOutput = content
            .map((block: any) => (typeof block === 'string' ? block : typeof block?.text === 'string' ? block.text : ''))
            .join('');
        } else {
          agentOutput = content == null ? '' : String(content);
        }
        break;
      }
    }

    let results: Array<{ title: string; snippet: string; link: string; displayLink: string }> = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const msgType = typeof msg?._getType === 'function' ? msg._getType() : msg?.type ?? msg?.role;
      if (msgType === 'tool') {
        const content = msg?.content;
        const raw = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((block: any) => (typeof block === 'string' ? block : typeof block?.text === 'string' ? block.text : '')).join('')
            : content == null
              ? ''
              : String(content);
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.results)) {
            results = parsed.results;
            break;
          }
        } catch { }
      }
    }

    if (!results.length) {
      try {
        const raw = await (metasoTool as any).invoke({
          query: input,
          num: typeof num === 'number' ? num : undefined,
        });
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.results)) results = parsed.results;
      } catch {
        results = await callMetasoSearchApi(input, {
          num: typeof num === 'number' ? num : 5,
        });
      }
    }

    ctx.status = 200;
    ctx.body = {
      query: input,
      agentOutput,
      results,
      model: typeof modelName === 'string' ? modelName : process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '代理搜索失败';
    const status = (err as any)?.status ?? 500;
    ctx.status = status;
    ctx.body = { message };
  }
}

/**
 * 注册 Agent 相关路由
 * @param {Router} router Koa Router 实例
 * @returns {void}
 */
export function registerAgentRoutes(router: Router): void {
  router.post('/agent/metaso-search', metasoSearchAgentHandler);
}