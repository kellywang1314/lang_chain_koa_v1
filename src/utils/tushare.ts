import { postJson } from './axios';
import { tushareBaseUrl } from '../const/tushare';

export interface TushareReportItem {
    end_date?: string;
    ann_date?: string;
    eps?: number;
    roe?: number;
    roe_dt?: number;
    netprofit_yoy?: number;
    or_yoy?: number;
    grossprofit_margin?: number;
    netprofit_margin?: number;
}

function getTushareToken(): string {
    const rawToken = process.env.TUSHARE_TOKEN ?? '';
    const token = rawToken.trim().replace(/^['"]|['"]$/g, '');
    if (!token) {
        throw Object.assign(new Error('缺少 TUSHARE_TOKEN 环境变量'), { status: 500 });
    }
    return token;
}

function normalizeChinaSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('.SH') || upper.endsWith('.SZ')) return upper;
    const market = upper.startsWith('6') || upper.startsWith('9') ? 'SH' : 'SZ';
    return `${upper}.${market}`;
}

async function callTushare<T = any>(apiName: string, params: Record<string, unknown>, fields: string, limit?: number): Promise<T> {
    const token = getTushareToken();
    const body: Record<string, unknown> = {
        api_name: apiName,
        token,
        params,
        fields,
    };
    if (typeof limit === 'number') body.limit = limit;
    const data: any = await postJson(tushareBaseUrl, body);
    if (data?.code !== 0) {
        throw new Error(`Tushare 调用失败: ${data?.msg ?? 'unknown error'}`);
    }
    return data as T;
}

function mapTushareRows(fields: string[], items: any[][]): Record<string, unknown>[] {
    return items.map((row) => Object.fromEntries(fields.map((field, idx) => [field, row[idx]])));
}

export async function fetchTushareReports(symbol: string, count: number = 3): Promise<{ symbol: string; reports: TushareReportItem[]; source: 'tushare' }> {
    const tsCode = normalizeChinaSymbol(symbol);
    const data: any = await callTushare(
        'fina_indicator',
        { ts_code: tsCode },
        'end_date,ann_date,eps,roe,roe_dt,netprofit_yoy,or_yoy,grossprofit_margin,netprofit_margin',
        Math.max(count, 5)
    );

    const fields = (data?.data?.fields ?? []) as string[];
    const items = (data?.data?.items ?? []) as any[][];
    if (!fields.length || !items.length) {
        throw new Error(`未获取到财报数据：${tsCode}`);
    }

    const rows = mapTushareRows(fields, items).slice(0, count) as TushareReportItem[];
    return { symbol: tsCode, reports: rows, source: 'tushare' };
}