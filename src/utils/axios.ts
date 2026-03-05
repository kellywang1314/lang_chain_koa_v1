import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';

export const http: AxiosInstance = axios.create({
    timeout: 10_000,
    headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'langchain-koa',
    },
});

function formatAxiosError(err: unknown): string {
    if (!axios.isAxiosError(err)) {
        return err instanceof Error ? err.message : String(err);
    }

    const e = err as AxiosError;
    const method = (e.config?.method ?? 'GET').toUpperCase();
    const url = e.config?.url ?? '';

    if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText ?? '';
        const data = e.response.data;
        const bodyPreview =
            typeof data === 'string'
                ? data.slice(0, 300)
                : data && typeof data === 'object'
                    ? JSON.stringify(data).slice(0, 300)
                    : '';

        return `${method} ${url} -> HTTP ${status} ${statusText}${bodyPreview ? `: ${bodyPreview}` : ''}`;
    }

    if (e.code) {
        return `${method} ${url} -> ${e.code}: ${e.message}`;
    }

    return `${method} ${url} -> ${e.message}`;
}

export async function getJson<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
        const res = await http.get<T>(url, config);
        return res.data;
    } catch (err) {
        throw new Error(formatAxiosError(err));
    }
}

export async function postJson<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
        const res = await http.post<T>(url, data, config);
        return res.data;
    } catch (err) {
        throw new Error(formatAxiosError(err));
    }
}

export async function getText(url: string, config?: AxiosRequestConfig): Promise<string> {
    try {
        const res = await http.get<string>(url, { ...config, responseType: 'text' });
        return res.data as string;
    } catch (err) {
        throw new Error(formatAxiosError(err));
    }
}