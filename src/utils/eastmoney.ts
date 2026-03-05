import { getJson } from './axios';
import {
    eastmoneyBaseUrl,
    eastmoneyBoardListPath,
    eastmoneyDefaultUt,
    eastmoneyFflowPath,
    eastmoneyKlineBaseUrl,
    eastmoneyKlineFields1,
    eastmoneyKlineFields2,
    eastmoneyKlinePath,
    eastmoneyNoticeBaseUrl,
    eastmoneyNoticePath,
    eastmoneyQuoteFields,
    eastmoneyQuotePath,
} from '../const/eastmoney';

// 行情报价返回结构
export interface EastmoneyQuoteResult {
    symbol: string;
    shortName?: string;
    price?: number;
    change?: number;
    changePercent?: number;
    prevClose?: number;
    currency: 'CNY';
    source: 'eastmoney';
}

export type EastmoneyMarket = 'SH' | 'SZ';

export interface EastmoneyKlineOptions {
    klt?: number;
    fqt?: 0 | 1 | 2;
    lmt?: number;
    end?: string;
}

export interface EastmoneyKlineResult {
    symbol: string;
    market: EastmoneyMarket;
    name?: string;
    klines: string[];
    source: 'eastmoney';
}

export interface EastmoneyNoticeItem {
    title?: string;
    publishTime?: number;
    url?: string;
    summary?: string;
    infoCode?: string;
}

export interface EastmoneyNoticeResult {
    symbol: string;
    list: EastmoneyNoticeItem[];
    source: 'eastmoney';
}

// 判断是否为 A 股代码
export function isChinaSymbol(symbol: string): boolean {
    return /\.(SH|SZ)$/i.test(symbol) || /^\d{6}$/.test(symbol);
}

// 解析并归一化 A 股代码
export function resolveChinaSymbol(symbol: string): { code: string; market: EastmoneyMarket } {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('.SH')) return { code: upper.replace('.SH', ''), market: 'SH' };
    if (upper.endsWith('.SZ')) return { code: upper.replace('.SZ', ''), market: 'SZ' };
    const code = upper;
    const market = code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ';
    return { code, market };
}

// 获取行情报价数据
export async function fetchEastmoneyQuote(symbol: string): Promise<EastmoneyQuoteResult> {
    const { code, market } = resolveChinaSymbol(symbol);
    const secid = `${market === 'SH' ? 1 : 0}.${code}`;
    const url = `${eastmoneyBaseUrl}${eastmoneyQuotePath}?secid=${encodeURIComponent(secid)}&fields=${eastmoneyQuoteFields}&ut=${eastmoneyDefaultUt}&invt=2&fltt=2`;
    const data = await getJson<any>(url);
    const d = data?.data;
    if (!d) {
        throw new Error(`未获取到报价数据：${symbol}`);
    }

    const price = Number(d.f43);
    const prevClose = Number(d.f60);
    const change = Number(d.f171);
    const changePercent = Number(d.f170);

    return {
        symbol: `${code}.${market}`,
        shortName: d.f58,
        price,
        change: Number.isFinite(change) ? change : (Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : undefined),
        changePercent: Number.isFinite(changePercent)
            ? changePercent
            : (Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : undefined),
        prevClose: Number.isFinite(prevClose) ? prevClose : undefined,
        currency: 'CNY',
        source: 'eastmoney',
    };
}

export async function fetchEastmoneyKlines(symbol: string, options: EastmoneyKlineOptions = {}): Promise<EastmoneyKlineResult> {
    const { code, market } = resolveChinaSymbol(symbol);
    const secid = `${market === 'SH' ? 1 : 0}.${code}`;
    const klt = options.klt ?? 101;
    const fqt = options.fqt ?? 1;
    const lmt = options.lmt ?? 120;
    const end = options.end ?? '20500101';

    const url = `${eastmoneyKlineBaseUrl}${eastmoneyKlinePath}?secid=${encodeURIComponent(secid)}&klt=${klt}&fqt=${fqt}&lmt=${lmt}&end=${encodeURIComponent(end)}&fields1=${encodeURIComponent(eastmoneyKlineFields1)}&fields2=${encodeURIComponent(eastmoneyKlineFields2)}&ut=${eastmoneyDefaultUt}`;
    const data = await getJson<any>(url);
    const d = data?.data;
    if (!d?.klines) {
        throw new Error(`未获取到K线数据：${symbol}`);
    }

    return {
        symbol: `${code}.${market}`,
        market,
        name: d.name,
        klines: d.klines,
        source: 'eastmoney',
    };
}

export async function fetchEastmoneyNotices(symbol: string, count: number = 5): Promise<EastmoneyNoticeResult> {
    const { code, market } = resolveChinaSymbol(symbol);
    const stockList = `${code}.${market}`;
    const primaryUrl = `${eastmoneyNoticeBaseUrl}${eastmoneyNoticePath}?page_size=${count}&page_index=1&ann_type=A&client=web&stock_list=${encodeURIComponent(stockList)}`;
    const primary = await getJson<any>(primaryUrl);
    let list = (primary?.data?.list ?? []) as any[];

    if (list.length === 0) {
        const fallbackUrl = `${eastmoneyNoticeBaseUrl}${eastmoneyNoticePath}?page_size=${count}&page_index=1&client=web&stock_list=${encodeURIComponent(stockList)}`;
        const fallback = await getJson<any>(fallbackUrl);
        list = (fallback?.data?.list ?? []) as any[];
    }

    return {
        symbol: `${code}.${market}`,
        list: list.map((item) => ({
            title: item?.title,
            publishTime: item?.notice_date || item?.publish_time,
            url: item?.url,
            summary: item?.summary,
            infoCode: item?.info_code,
        })),
        source: 'eastmoney',
    };
}

export async function fetchEastmoneyBoardList(params: {
    fs: string;
    fields?: string;
    pn?: number;
    pz?: number;
    fid?: string;
}): Promise<any> {
    const pn = params.pn ?? 1;
    const pz = params.pz ?? 20;
    const fid = params.fid ?? 'f3';
    const fields = params.fields ?? 'f12,f14,f2,f3,f62';

    const url = `${eastmoneyBaseUrl}${eastmoneyBoardListPath}?pn=${pn}&pz=${pz}&fid=${encodeURIComponent(fid)}&fs=${encodeURIComponent(params.fs)}&fields=${encodeURIComponent(fields)}`;
    return await getJson<any>(url);
}