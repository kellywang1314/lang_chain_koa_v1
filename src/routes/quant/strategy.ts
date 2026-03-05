// 策略agent
import Router from '@koa/router';
import { Context } from 'koa';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createAgent } from 'langchain';
import {
    createDashScopeChatModel,
    getKoaRequestBody,
    getRequiredBodyString,
    setKoaError,
    setKoaJson,
} from '../../utils/dashscope';
import { getJson } from '../../utils/axios';
import { fetchEastmoneyKlines, fetchEastmoneyQuote, isChinaSymbol } from '../../utils/eastmoney';
import { fetchTushareReports } from '../../utils/tushare';

function computeRsi(closes: number[], period: number): number {
    if (closes.length < period + 1) {
        throw new Error(`数据不足，无法计算 RSI：需要至少 ${period + 1} 个收盘价`);
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i += 1) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses += -diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i += 1) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

// 股票价格工具
const stockPriceTool = new DynamicStructuredTool({
    name: 'get_stock_price',
    description: '获取指定股票代码的当前实时价格和涨跌幅（数据源：东财 A 股 / Stooq 美股）',
    schema: z.object({
        symbol: z.string().describe('股票代码，例如 AAPL, TSLA, 600519.SH, 000001.SZ（A股建议加交易所后缀）'),
    }),
    func: async ({ symbol }) => {
        if (isChinaSymbol(symbol)) {
            const quote = await fetchEastmoneyQuote(symbol);
            return JSON.stringify({
                symbol: quote.symbol,
                shortName: quote.shortName,
                price: quote.price,
                change: quote.change,
                change_percent: quote.changePercent,
                currency: quote.currency,
                marketState: 'OPEN',
                timestamp: new Date().toISOString(),
                source: quote.source,
            });
        }
    },
});

/**
 * 获取财经新闻
 */
const financialNewsTool = new DynamicStructuredTool({
    name: 'get_financial_news',
    description: '搜索关于指定股票/关键词的最新财经新闻（数据源：Yahoo Finance Search）',
    schema: z.object({
        query: z.string().describe('搜索关键词或股票代码，例如 AAPL 或 苹果'),
        count: z.number().min(1).max(10).default(5).describe('返回新闻条数，默认 5'),
    }),
    func: async ({ query, count }) => {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}`;
        const data = await getJson(url);
        const news = ((data as any)?.news ?? []) as any[];

        return JSON.stringify(
            news.slice(0, count).map((n) => ({
                title: n?.title,
                publisher: n?.publisher,
                link: n?.link,
                providerPublishTime: n?.providerPublishTime,
                publishedAt: typeof n?.providerPublishTime === 'number'
                    ? new Date(n.providerPublishTime * 1000).toISOString()
                    : undefined,
                type: n?.type,
                source: 'yahoo_finance',
            }))
        );
    },
});

// 计算技术指标 (RSI)
const rsiTool = new DynamicStructuredTool({
    name: 'calculate_rsi',
    description: '计算指定股票的 RSI (相对强弱指标，数据源：东方财富 K 线)',
    schema: z.object({
        symbol: z.string().describe('A股股票代码，例如 600519.SH、000001.SZ'),
        period: z.number().min(2).max(100).default(14).describe('RSI 周期，默认 14'),
        range: z.enum(['1mo', '3mo', '6mo', '1y', '2y', '5y']).default('3mo').describe('拉取历史数据区间，默认 3mo'),
        interval: z.enum(['1d', '1h', '15m', '5m']).default('1d').describe('K 线间隔，默认 1d'),
    }),
    func: async ({ symbol, period, range, interval }) => {
        if (!isChinaSymbol(symbol)) {
            throw new Error('东方财富 RSI 暂仅支持 A 股代码');
        }

        const klt = interval === '1h' ? 60 : interval === '15m' ? 15 : interval === '5m' ? 5 : 101;
        const lmt = range === '1mo'
            ? 30
            : range === '3mo'
                ? 90
                : range === '6mo'
                    ? 180
                    : range === '1y'
                        ? 260
                        : range === '2y'
                            ? 520
                            : 1300;

        const data = await fetchEastmoneyKlines(symbol, { klt, lmt, fqt: 1 });
        const closes = data.klines
            .map((row) => row.split(',')[2])
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));

        const rsi = computeRsi(closes, period);
        const signal = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral';

        return JSON.stringify({
            symbol: data.symbol,
            indicator: 'RSI',
            period,
            range,
            interval,
            value: Number(rsi.toFixed(2)),
            signal,
            points: closes.length,
            source: 'eastmoney',
        });
    },
});

// 读取财务报告工具
const financialReportTool = new DynamicStructuredTool({
    name: 'read_financial_reports',
    description: '获取近几次财报核心指标（数据源：Tushare）',
    schema: z.object({
        symbol: z.string().describe('A股股票代码，例如 600519.SH、000001.SZ'),
        count: z.number().min(1).max(8).default(4).describe('返回财报条数，默认 4'),
    }),
    func: async ({ symbol, count }) => {
        if (!isChinaSymbol(symbol)) {
            throw new Error('Tushare 财报暂仅支持 A 股代码');
        }
        const data = await fetchTushareReports(symbol, count);
        return JSON.stringify({
            symbol: data.symbol,
            count: data.reports.length,
            reports: data.reports,
            source: data.source,
        });
    },
});

const tools = [stockPriceTool, financialNewsTool, rsiTool, financialReportTool];

// --- 2. 构建 Agent ---
export async function quantAnalysisHandler(ctx: Context): Promise<void> {
    try {
        const body = getKoaRequestBody(ctx);
        const symbol = getRequiredBodyString(body, 'symbol', '缺少股票代码 symbol');
        const rawQuery = body.query || `请分析 ${symbol} 的投资价值，并给出买入/卖出/持有建议。`;
        const userQuery = rawQuery.includes(symbol)
            ? rawQuery
            : `${rawQuery}\n\n股票代码：${symbol}`;

        // 1. 初始化模型 (开启搜索能力可选，这里用 Tool 代替)
        const llm = createDashScopeChatModel({ temperature: 0 });

        const systemPrompt = `你是一名资深的量化交易员和金融分析师。
你必须基于工具数据完成分析，禁止要求用户再次提供股票代码。
当前要分析的股票代码是：${symbol}
分析时必须调用以下工具并引用其结果：
1) get_stock_price 获取实时价格与涨跌幅
2) get_financial_news 获取最新新闻
3) calculate_rsi 计算 RSI 指标
4) read_financial_reports 研读近期财报要点
请严格基于数据说话，不要编造事实。
如果数据相互矛盾（例如价格上涨但RSI超买），请在分析中指出来。
最后必须给出一个明确的建议：【买入】、【卖出】或【观望】，并说明理由。`;

        // 2. 创建 Agent（将 prompt 中的系统信息通过 systemPrompt 传入）
        const agent = createAgent({
            model: llm,
            tools,
            systemPrompt, // 固定系统提示,定义agent的行为和能力
            name: 'quantAgent',
            description: '基于工具数据进行量化分析并给出交易建议的 Agent',
        });

        // 3. 执行
        const result = await agent.invoke({
            messages: [
                new SystemMessage(`股票代码：${symbol}`), // 本次请求的系统消息
                new HumanMessage(userQuery),
            ],
        });

        const resultMessages = (result as any)?.messages as Array<{ content?: unknown }> | undefined;
        const lastMessage = resultMessages?.length ? resultMessages[resultMessages.length - 1] : undefined;
        const analysis = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content ?? result);

        setKoaJson(ctx, 200, {
            symbol,
            analysis,
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        setKoaError(ctx, err, '量化分析失败');
    }
}

export function registerQuantRoutes(router: Router): void {
    router.post('/quant/strategy', quantAnalysisHandler);
}