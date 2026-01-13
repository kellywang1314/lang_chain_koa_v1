# lang_chain_koa_v1

基于 Koa + TypeScript 的 LangChain.js 学习/实验项目，集成了：
- Mistral 翻译链
- 秘塔（Metaso）联网搜索 Agent
- DashScope（通义千问）联网搜索 Agent（OpenAI compatible-mode）
- DashScope 视觉模型图片读取（OpenAI compatible-mode）

## 环境要求
- Node.js `>= 18`（项目中使用了全局 `fetch`）

## 安装
```bash
npm install
```

## 启动
- 开发模式（自动加载 `.env`，热重启）：
```bash
npm run dev
```
- 生产模式：
```bash
npm run start
```

默认端口：`3000`（可用 `PORT` 覆盖）。

## 环境变量
建议在项目根目录创建 `.env`：
```bash
PORT=3000

# Mistral
MISTRAL_API_KEY=xxx
MISTRAL_MODEL=mistral-small-latest

# Metaso
METASOL_API_KEY=xxx

# DashScope
DASHSCOPE_API_KEY=xxx
```

## 接口
> 统一使用 `Content-Type: application/json`。

### 基础
- `GET /`：健康检查

### Mistral 翻译
- `POST /mistral/translate`

请求体：
```json
{ "text": "你好", "targetLanguage": "en" }
```

示例：
```bash
curl -s http://localhost:3000/mistral/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"你好","targetLanguage":"en"}'
```

### Metaso 搜索 Agent
- `POST /agent/metaso-search`

请求体：
```json
{ "input": "搜索电视剧何以笙箫默主题曲", "num": 5 }
```

### DashScope 联网搜索
- `POST /dashscope/web-search`

请求体：
```json
{ "input": "今天北京天气怎么样", "model": "qwen-plus", "max_tokens": 512, "temperature": 0 }
```

示例：
```bash
curl -s http://localhost:3000/dashscope/web-search \
  -H 'Content-Type: application/json' \
  -d '{"input":"搜索电视剧何以笙箫默主题曲","model":"qwen-plus","max_tokens":512,"temperature":0}'
```

返回体字段：
- `query`: 原始输入
- `agentOutput`: Agent 最终回答（字符串）
- `model`: 模型名

### DashScope 图片读取（视觉理解）
- `POST /dashscope/image-read`

请求体（二选一）：
- 传 URL：
```json
{ "imageUrl": "https://.../a.png", "question": "这张图里有什么？", "model": "qwen-vl-plus" }
```
- 传 Base64：
```json
{ "imageBase64": "...", "imageMimeType": "image/png", "question": "识别图中文字" }
```

示例：
```bash
curl -s http://localhost:3000/dashscope/image-read \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg","question":"这张图里有什么？","model":"qwen-vl-plus","max_tokens":512,"temperature":0}'
```

返回体字段：
- `answer`: 视觉模型回答文本
- `model`: 模型名
- `question`: 实际提问

## 目录结构
- `src/server.ts`：Koa 启动入口
- `src/middleware`：错误处理、bodyparser、访问日志
- `src/routes`：HTTP 路由（mistral / agent / dashscope）
- `src/utils/dashscope.ts`：DashScope 公共工具（API Key、client、Koa 入参解析等）


