# LangChain 基础概念梳理

LangChain 是一个用于开发由语言模型驱动的应用程序的框架。它提供了一套标准化的接口和组件，使得将 LLM（大语言模型）与外部数据源、计算能力相结合变得简单。

## 1. Models (模型)
LangChain 将模型分为两类，但提供了统一的接口：

*   **LLMs (纯文本模型)**: 输入是一个字符串，输出是一个字符串。
    *   *场景*: 简单的文本补全。
*   **Chat Models (聊天模型)**: 输入是一组消息列表 (Messages)，输出是一条 AI 消息。
    *   *场景*: 对话、指令跟随（这是目前的主流）。
    *   *Message 类型*: `SystemMessage` (系统设定), `HumanMessage` (用户输入), `AIMessage` (模型回复)。

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  modelName: "gpt-3.5-turbo", // 或 "qwen-plus"
  temperature: 0.7,
});

const response = await model.invoke("你好");
console.log(response.content);
```

## 2. Prompts (提示词模板)
将硬编码的 Prompt 变成动态模板，类似于前端的模板引擎 (Handlebars/EJS)。

*   **PromptTemplate**: 用于 LLM 的字符串模板。
*   **ChatPromptTemplate**: 用于 Chat Model 的消息列表模板。

```typescript
import { ChatPromptTemplate } from "@langchain/core/prompts";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一名{role}。"],
  ["human", "{input}"],
]);

const formatted = await prompt.format({
  role: "翻译官",
  input: "Hello world"
});
// 输出: System: 你是一名翻译官。 Human: Hello world
```

## 3. Chains (链)
将多个组件（Prompt -> Model -> OutputParser）串联起来，形成一个处理流。现在推荐使用 **LCEL (LangChain Expression Language)** 也就是 `.pipe()` 语法。

```typescript
import { StringOutputParser } from "@langchain/core/output_parsers";

const chain = prompt.pipe(model).pipe(new StringOutputParser());

// 调用链：输入变量 -> 渲染Prompt -> 调用模型 -> 解析输出为字符串
const result = await chain.invoke({
  role: "翻译官",
  input: "Hello world"
});
```

## 4. Output Parsers (输出解析器)
将模型输出的纯文本转换为结构化数据。

*   **StringOutputParser**: 转为字符串（去除引号等）。
*   **StructuredOutputParser / ZodOutputParser**: 转为 JSON 对象（强类型校验）。

## 5. Tools (工具)
赋予模型“手”的能力。工具是一个包含 `name`、`description` 和 `schema` (参数定义) 的函数。模型根据 description 决定是否调用，根据 schema 生成参数。

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const searchTool = tool(
  async ({ query }) => {
    return "搜索结果...";
  },
  {
    name: "web_search",
    description: "联网搜索工具",
    schema: z.object({ query: z.string() }),
  }
);
```

## 6. Agents (智能体)
Agent 是使用 LLM 作为推理引擎来决定采取什么行动（调用哪个 Tool）以及按什么顺序执行的系统。

*   **ReAct**: Reason + Act。模型先思考 -> 决定调用工具 -> 获取工具结果 -> 再思考 -> 回答。
*   **LangGraph**: 目前 LangChain 推荐的高级 Agent 编排方式（图结构）。

## 7. Memory (记忆)
让无状态的 LLM 能够“记住”之前的对话上下文。

*   **ConversationBufferMemory**: 全量保存所有历史。
*   **ConversationSummaryMemory**: 自动总结之前的对话，只保留摘要。
*   **WindowMemory**: 只保留最近 N 轮。

## 8. RAG (检索增强生成)
让模型能够“外挂”知识库。

*   **Loader**: 加载 PDF/Word/网页。
*   **Splitter**: 把长文档切成小块。
*   **Embedding**: 把文本变成向量（数字列表）。
*   **VectorStore**: 存向量的数据库 (Redis/Pinecone/Faiss)。
*   **Retriever**: 根据问题去数据库里找相关的片段。

---
**核心公式**:
`Prompt` + `LLM` + `OutputParser` = **Chain**
`Chain` + `Memory` + `Tools` + `Loop` = **Agent**