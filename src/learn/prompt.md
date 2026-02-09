# LangChain Prompt Templates 指南

提示词模板 (Prompt Template) 是 LLM 开发中最基础也是最重要的组件。它将静态的指令文本和动态的用户输入结合，生成最终发给模型的 Prompt。

## 一、 核心 Prompt 类型

LangChain 提供了多种模板类型以适应不同的模型接口和场景。

### 1. StringPromptTemplate (基础字符串模板)
最基础的形式，适用于 LLM 接口（接收纯文本输入）。
*   **适用场景**: 简单的问答、文本补全。
*   **特点**: 仅包含一个 prompt 字符串。

```typescript
import { PromptTemplate } from "@langchain/core/prompts";

const prompt = PromptTemplate.fromTemplate(
  "请为一家生产 {product} 的公司取一个好听的名字。"
);
const formatted = await prompt.format({ product: "彩色袜子" });
// 输出: "请为一家生产 彩色袜子 的公司取一个好听的名字。"
```

### 2. ChatPromptTemplate (聊天提示词模板)
专为 Chat Model（如 GPT-3.5/4, Claude）设计，接收消息列表 (List of Messages)。
*   **结构**: 由 `SystemMessage` (系统指令), `HumanMessage` (用户输入), `AIMessage` (AI 回复) 组成。
*   **适用场景**: 绝大多数现代 LLM 应用。

```typescript
import { ChatPromptTemplate } from "@langchain/core/prompts";

const chatPrompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个专业的翻译助手，请将用户输入的 {source_lang} 翻译成 {target_lang}。"],
  ["human", "{text}"],
]);

const formatted = await chatPrompt.formatMessages({
  source_lang: "中文",
  target_lang: "英文",
  text: "你好，世界"
});
// 输出: [SystemMessage(...), HumanMessage(...)]
```

### 3. FewShotPromptTemplate (少样本提示词)
**核心技巧**: "Show, Don't Tell" (展示，而不是只告诉)。
通过提供几个示例 (Examples)，让模型学习输出格式和风格，显著提高复杂任务的准确率。

```typescript
import { PromptTemplate, FewShotPromptTemplate } from "@langchain/core/prompts";

// 1. 定义示例
const examples = [
  { input: "高兴", output: "😢" }, // 故意反向映射的例子
  { input: "悲伤", output: "😄" },
];

// 2. 定义单个示例的格式
const examplePrompt = PromptTemplate.fromTemplate(
  "输入: {input}\n输出: {output}"
);

// 3. 组合
const fewShotPrompt = new FewShotPromptTemplate({
  examples,
  examplePrompt,
  prefix: "你是一个反义词表情包转换器。请参考以下示例：",
  suffix: "输入: {input}\n输出:",
  inputVariables: ["input"],
});
```

---

## 二、 高级 Prompt 技巧与模式

### 1. Chain-of-Thought (CoT, 思维链)
引导模型在给出最终答案前，先输出推理过程。
*   **模板**: `Let's think step by step.` (让我们一步步思考)
*   **效果**: 显著提升数学、逻辑推理任务的准确率。

### 2. Structured Output (结构化输出)
配合 `OutputParser` 使用，强制模型输出 JSON 格式。
*   **模板**: 通常在 System Prompt 中加入 `{format_instructions}`。

```typescript
const prompt = ChatPromptTemplate.fromMessages([
    ["system", "提取用户信息。\n{format_instructions}"],
    ["human", "{text}"]
]);
```

### 3. Partial Prompt Templates (部分应用模板)
类似于函数的 "柯里化" (Currying)。先填充一部分参数（如公共的 System 指令），稍后再填充另一部分（用户输入）。

```typescript
const prompt = new PromptTemplate({
  template: "{foo} {bar}",
  inputVariables: ["bar"],
  partialVariables: { foo: "Hello" } // 预先填充
});
```

---

## 三、 生产环境最佳实践 (Best Practices)

1.  **版本控制**: Prompt 是代码的一部分，甚至比代码更重要。不要硬编码在代码深处，建议抽离成独立文件或使用 LangSmith Hub 进行管理。
2.  **明确的角色定义 (Persona)**: 始终在 System Message 中赋予模型一个清晰的角色（如“资深后端工程师”、“严谨的法律顾问”）。
3.  **使用分隔符**: 使用 `"""`, `---`, `###` 等符号将指令、上下文和用户输入清晰地隔开，防止 Prompt Injection 攻击。
    *   *Bad*: 请总结这篇文章：{article}
    *   *Good*: 请总结以下由三个引号包裹的文章：\n"""\n{article}\n"""
4.  **迭代优化**: Prompt 没有银弹。需要建立评估集 (Evaluation Set)，不断测试和调整 Prompt 的措辞。