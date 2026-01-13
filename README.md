# LangChainJs 学习


# .env 配置文件
MISTRAL_API_KEY = xxxx
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT='https://api.smith.langchain.com'
LANGSMITH_API_KEY=xxxx
LANGSMITH_PROJECT='lang_chain_koa_v1'

# npm install
# npm run dev

# openai api 调用示例
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer xxxx" \
  -d '{
    "model": "gpt-5-nano",
    "input": "write a haiku about ai",
    "store": true
  }'
