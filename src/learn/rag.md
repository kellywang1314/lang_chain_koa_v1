# RAG (Retrieval-Augmented Generation) 深度指南

## 1. 核心概念
**RAG (检索增强生成)** 是一种技术架构，旨在解决大语言模型 (LLM) 的两个核心痛点：
1.  **知识过时**：模型训练截止日期之后发生的事情，它不知道。
2.  **私有数据缺失**：企业内部文档、个人笔记等非公开数据，模型没学过。
3.  **幻觉 (Hallucination)**：模型在一本正经地胡说八道。

**原理公式**：
> RAG = 检索 (Retrieve) + 增强 (Augment) + 生成 (Generate)

用户提问 -> **检索**数据库中最相关的知识片段 -> 将片段作为上下文**增强** Prompt -> 喂给 LLM **生成**准确回答。

## 2. 核心应用场景
1.  **企业知识库问答**：基于 Wiki、PDF 手册、Notion 文档回答员工问题（如 HR 政策、IT 支持）。
2.  **智能客服**：基于Rag产品说明书和 FAQ 库，精准回复用户技术问题，减少人工介入。
3.  **垂直领域助手**：法律、医疗、金融等需要极高准确性和引经据典的行业。
4.  **代码问答 (Code Copilot)**：基于整个代码仓库回答“登录逻辑在哪”、“这个函数怎么用”。
5.  **个人第二大脑**：基于个人笔记 (Obsidian/Logseq) 进行回顾和启发。

## 3. 生产级 RAG 实现架构
生产环境不能只靠简单的 `LangChain` Demo，需要构建完整的 **ETL Pipeline**：

### 3.1 数据摄取 (Ingestion)
*   **多源同步**：使用 Airbyte / Fivetran 自动同步 Slack, Jira, Confluence, Google Drive 数据。
*   **增量更新**：监听 Webhook 或定时任务，只处理变动的文件（基于 Hash 对比）。

### 3.2 数据处理 (Processing)
*   **高级解析 (Parsing)**：
    *   **Unstructured.io / Azure AI**: 识别 PDF 中的表格、多栏布局。
    *   **OCR**: 处理扫描件图片。
    *   **多模态**: 用 GPT-4o-vision 将图表转为文字描述。
*   **清洗 (Cleaning)**：去除页眉页脚、水印、乱码。
*   **切片 (Chunking)**：
    *   **语义切片 (Semantic Chunking)**：基于语义断句，而非固定字符数。
    *   **父子索引 (Parent-Child)**：检索小块（精准），返回大块（上下文完整）。

### 3.3 检索与排序 (Retrieval & Rerank)
*   **混合检索 (Hybrid Search)**：向量检索 (Semantic) + 关键词检索 (BM25/Elasticsearch)。
    *   *向量擅长语义，BM25 擅长精确匹配专有名词（如型号、错误码）。*
*   **重排序 (Rerank)**：使用 BGE-Reranker / Cohere Rerank 模型，对召回的 Top 50 结果进行精细打分，选出 Top 5 给 LLM。

### 3.4 评估 (Evaluation)
使用 **Ragas** 或 **TruLens** 框架评估 RAG 质量：
*   **Context Precision**: 检索到的内容真的相关吗？
*   **Faithfulness**: 回答是否忠实于检索内容（没瞎编）？
*   **Answer Relevance**: 回答是否解决了用户问题？

## 4. Agent 开发常见 RAG 问题

### Q1: 检索回来的内容太多，超过 Token 限制怎么办？
*   **Map-Reduce**: 让模型分批阅读片段并总结，最后合并总结。
*   **Refine**: 像接力棒一样，让模型基于片段 A 生成初稿，再基于片段 B 修改初稿。
*   **Re-ranking**: 只取相关度最高的 Top 3。

### Q2: 表格数据怎么处理？
*   不要把表格直接转纯文本（结构会乱）。
*   转为 Markdown 表格或 HTML 表格。
*   如果是复杂 Excel，建议转为 CSV/SQL，让 Agent 写 Python/SQL 代码去查询，而不是用 RAG 检索。

### Q3: 如何处理“多跳问题” (Multi-hop QA)？
*   *问题：马斯克收购推特那年的美国总统是谁？*（需要先查收购年份，再查该年份的总统）
*   **解决方案**: 使用 Agent (ReAct / LangGraph)，让模型自主决定分步搜索：
    1.  搜索“马斯克收购推特年份” -> 得到 2022。
    2.  搜索“2022年美国总统” -> 得到拜登。

### Q4: 向量数据库选哪个？
*   **生产托管**: Pinecone, Zilliz (Milvus Cloud)。
*   **自建大规模**: Milvus, Elasticsearch (8.x+)。
*   **轻量/Postgres栈**: PGVector (强烈推荐，如果你已有 PG)。
*   **本地/测试**: Chroma, Faiss。