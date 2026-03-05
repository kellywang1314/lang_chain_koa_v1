// 东方财富 API 基础地址
export const eastmoneyBaseUrl = 'https://push2.eastmoney.com';
export const eastmoneyKlineBaseUrl = 'https://push2his.eastmoney.com';
export const eastmoneyDefaultUt = 'fa5fd1943c7b386f172d6893dbfba10b';

// 行情详情（实时价格、涨跌幅等）
export const eastmoneyQuotePath = '/api/qt/stock/get';

export const eastmoneyQuoteFieldMap = {
    price: 'f43',
    high: 'f44',
    low: 'f45',
    open: 'f46',
    volume: 'f47',
    amount: 'f48',
    code: 'f57',
    name: 'f58',
    prevClose: 'f60',
    changePercent: 'f170',
    change: 'f171',
} as const;

export const eastmoneyQuoteFields = Object.values(eastmoneyQuoteFieldMap).join(',');

// K 线接口（日线/分钟线）
export const eastmoneyKlinePath = '/api/qt/stock/kline/get';
export const eastmoneyKlineFields1 = 'f1,f2,f3,f4,f5,f6';
export const eastmoneyKlineFields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

// 分时/趋势接口
export const eastmoneyMinutePath = '/api/qt/stock/trends2/get';
export const eastmoneyMinuteFields1 = 'f1,f2,f3,f4,f5,f6';
export const eastmoneyMinuteFields2 = 'f51,f52,f53,f54,f55,f56,f57,f58';

// 资金流 K 线接口
export const eastmoneyFflowPath = '/api/qt/stock/fflow/kline/get';

// 板块/排行列表接口
export const eastmoneyBoardListPath = '/api/qt/clist/get';

export const eastmoneyNoticeBaseUrl = 'https://np-anotice-stock.eastmoney.com';
export const eastmoneyNoticePath = '/api/security/ann';