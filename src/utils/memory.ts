import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
// InMemoryChatMessageHistory 是 LangChain 框架中用于 在内存中临时存储对话历史 的最基础组件
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';



/**
 * 1. ConversationBufferMemory（最直观）
 * 把所有历史消息原样保存，每次都拼进 prompt。
 */
export class ConversationBufferMemory {
    private readonly chatHistory: InMemoryChatMessageHistory;

    constructor() {
        this.chatHistory = new InMemoryChatMessageHistory();
    }

    async getMessages(): Promise<BaseMessage[]> {
        return this.chatHistory.getMessages();
    }

    async addUserMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new HumanMessage(content));
    }

    async addAiMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(content));
    }

    async clear(): Promise<void> {
        await this.chatHistory.clear();
    }
}

/**
 * 2. ConversationBufferWindowMemory (窗口记忆)
 * 只保留最近 k 条消息（例如 k=2 表示保留最近2轮对话，即4条消息）。
 */
export class ConversationBufferWindowMemory {
    private readonly chatHistory: InMemoryChatMessageHistory;
    private readonly k: number;

    constructor(k: number = 2) {
        this.chatHistory = new InMemoryChatMessageHistory();
        this.k = k;
    }

    async getMessages(): Promise<BaseMessage[]> {
        const messages = await this.chatHistory.getMessages();
        // k 轮 = 2*k 条消息。如果 messages 长度超过 2*k，就切片取最后 2*k 条
        const limit = this.k * 2;
        return messages.length > limit ? messages.slice(-limit) : messages;
    }

    async addUserMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new HumanMessage(content));
    }

    async addAiMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(content));
    }

    async clear(): Promise<void> {
        await this.chatHistory.clear();
    }
}

/**
 * 3. ConversationSummaryMemory (总结记忆)
 * 随着对话进行，不断更新“摘要”。每次只把“摘要”发给 LLM，而不是原始对话。
 */
export class ConversationSummaryMemory {
    private summary: string = '';
    private readonly llm: ChatOpenAI;

    constructor(llm: ChatOpenAI) {
        this.llm = llm;
    }

    async getSystemMessageContent(): Promise<string> {
        return this.summary ? `这是之前的对话摘要：${this.summary}` : '';
    }

    async addUserMessage(content: string): Promise<void> {
        // 简化实现：这里只记录，实际生产中可能在 addAiMessage 后统一触发总结
    }

    async addAiMessage(lastUserMessage: string, lastAiMessage: string): Promise<void> {
        // 调用 LLM 生成新的摘要
        const prompt = ChatPromptTemplate.fromTemplate(`
        请根据当前摘要和新的对话，生成一个新的摘要。
        当前摘要: {summary}
        新的人类消息: {human}
        新的AI消息: {ai}
        新的摘要:
        `);
        const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
        this.summary = await chain.invoke({
            summary: this.summary || '无',
            human: lastUserMessage,
            ai: lastAiMessage,
        });
    }
}

/**
 * 4. ConversationSummaryBufferMemory (混合记忆)
 * 保留最近 k 条原始消息，之前的消息压缩成 summary。
 * （这是一个高级实现，这里提供一个简化版思路：总是维护 summary + 最近 k 条）
 */
export class ConversationSummaryBufferMemory {
    private summary: string = '';
    private readonly chatHistory: InMemoryChatMessageHistory;
    private readonly k: number;
    private readonly llm: ChatOpenAI;

    constructor(llm: ChatOpenAI, k: number = 2) {
        this.llm = llm;
        this.chatHistory = new InMemoryChatMessageHistory();
        this.k = k;
    }

    async getContext(): Promise<{ summary: string; recentMessages: BaseMessage[] }> {
        const messages = await this.chatHistory.getMessages();
        const limit = this.k * 2;
        const recentMessages = messages.length > limit ? messages.slice(-limit) : messages;
        return { summary: this.summary, recentMessages };
    }

    async saveContext(userContent: string, aiContent: string): Promise<void> {
        await this.chatHistory.addMessage(new HumanMessage(userContent));
        await this.chatHistory.addMessage(new AIMessage(aiContent));

        const messages = await this.chatHistory.getMessages();
        // 如果消息积累太多，就触发一次总结（简化策略：超过 k+2 轮时，把最早的一轮总结掉）
        // 实际工程中通常是定期全量总结或增量总结
        if (messages.length > (this.k + 2) * 2) {
            await this.updateSummary(messages.slice(0, messages.length - this.k * 2));
        }
    }

    private async updateSummary(oldMessages: BaseMessage[]): Promise<void> {
        const textToSummarize = oldMessages
            .map((m) => `${m._getType()}: ${m.content}`)
            .join('\n');

        const prompt = ChatPromptTemplate.fromTemplate(`
        请把以下对话内容合并到现有的摘要中。
        现有摘要: {summary}
        待合并对话: {new_lines}
        更新后的摘要:
        `);

        const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
        this.summary = await chain.invoke({
            summary: this.summary || '无',
            new_lines: textToSummarize
        });
    }
}

/**
 * 5. EntityMemory (实体记忆)
 * 提取对话中的实体（人名、地点等）并保存。
 */
export class EntityMemory {
    private entities: Record<string, string> = {}; // key: 实体名, value: 描述
    private readonly llm: ChatOpenAI;

    constructor(llm: ChatOpenAI) {
        this.llm = llm;
    }

    async getEntityContext(): Promise<string> {
        if (Object.keys(this.entities).length === 0) return '';
        return `已知实体信息：\n${Object.entries(this.entities).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
    }

    async saveContext(userContent: string): Promise<void> {
        // 让 LLM 提取实体
        const prompt = ChatPromptTemplate.fromTemplate(`
        请从下面这句话中提取关键实体（人名、地名、产品名），并简要描述。
        如果提到已知实体，请更新描述。
        
        已知实体: {entities}
        当前输入: {input}
        
        请只输出 JSON 格式，例如 {{"小明": "用户的朋友", "北京": "首都"}}。如果没有新实体，输出 {{}}。
        `);

        const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
        try {
            const result = await chain.invoke({
                entities: JSON.stringify(this.entities),
                input: userContent
            });
            // 简单的 JSON 解析（生产环境建议用 Structured Output）
            const newEntities = JSON.parse(result.replace(/```json|```/g, '').trim());
            this.entities = { ...this.entities, ...newEntities };
        } catch (e) {
            console.error('实体提取失败', e);
        }
    }
}

/**
 * 创建千问 Chat 模型（DashScope compatible-mode）
 * @param {{ model?: string; temperature?: number } | undefined} options 可选参数
 * @returns {ChatOpenAI} 模型实例
 */
export function createQwenChatModel(options?: { model?: string; temperature?: number }): ChatOpenAI {
    return new ChatOpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        model: options?.model ?? 'qwen-plus',
        temperature: options?.temperature ?? 0,
        configuration: {
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
    });
}

/**
 * 通用对话辅助函数（支持不同 Memory 类型）
 */
export async function chatWithMemory(
    memory: any, // 这是一个演示用的通用类型，实际应定义接口
    input: string,
    type: 'buffer' | 'window' | 'summary' | 'summary_buffer' | 'entity'
): Promise<string> {
    const model = createQwenChatModel({ model: 'qwen-plus', temperature: 0 });
    let messages: BaseMessage[] = [];
    let systemText = '';

    // 1. 构造 Prompt 上下文
    if (type === 'buffer' || type === 'window') {
        const history = await memory.getMessages();
        messages = [...history];
    } else if (type === 'summary') {
        systemText = await memory.getSystemMessageContent();
    } else if (type === 'summary_buffer') {
        const { summary, recentMessages } = await memory.getContext();
        systemText = summary ? `摘要上下文: ${summary}` : '';
        messages = [...recentMessages];
    } else if (type === 'entity') {
        systemText = await memory.getEntityContext();
    }

    if (systemText) {
        messages.unshift(new SystemMessage(systemText));
    }
    messages.push(new HumanMessage(input));

    // 2. 调用模型
    const result = await model.invoke(messages);
    const answer = typeof result.content === 'string' ? result.content : String(result.content);

    // 3. 更新记忆
    if (type === 'buffer' || type === 'window') {
        await memory.addUserMessage(input);
        await memory.addAiMessage(answer);
    } else if (type === 'summary') {
        await memory.addAiMessage(input, answer);
    } else if (type === 'summary_buffer') {
        await memory.saveContext(input, answer);
    } else if (type === 'entity') {
        // 实体记忆通常只在 User 输入时提取，或者同时处理 User/AI
        await memory.saveContext(input);
    }

    return answer;
}

/**
 * 演示函数：一次性跑通 5 种记忆
 */
export async function demoAllMemories() {
    const model = createQwenChatModel();

    console.log('--- 1. Buffer Memory ---');
    const m1 = new ConversationBufferMemory();
    await chatWithMemory(m1, '我叫小明', 'buffer');
    console.log('Ask:', await chatWithMemory(m1, '我叫什么？', 'buffer'));

    console.log('\n--- 2. Window Memory (k=1) ---');
    const m2 = new ConversationBufferWindowMemory(1);
    await chatWithMemory(m2, '我是小红', 'window');
    await chatWithMemory(m2, '我喜欢吃苹果', 'window');
    // 下一句因为 k=1，"我是小红" 应该被遗忘了（或者在更严格的实现里被截断）
    console.log('Ask:', await chatWithMemory(m2, '我叫什么？', 'window'));

    console.log('\n--- 3. Summary Memory ---');
    const m3 = new ConversationSummaryMemory(model);
    await chatWithMemory(m3, '我计划去旅行，第一站去巴黎。', 'summary');
    await chatWithMemory(m3, '然后去伦敦。', 'summary');
    console.log('Ask:', await chatWithMemory(m3, '我的旅行计划是什么？', 'summary'));

    console.log('\n--- 4. Entity Memory ---');
    const m5 = new EntityMemory(model);
    await chatWithMemory(m5, '我的老板叫张三，他喜欢喝咖啡。', 'entity');
    console.log('Ask:', await chatWithMemory(m5, '张三是谁？他喜欢什么？', 'entity'));
}