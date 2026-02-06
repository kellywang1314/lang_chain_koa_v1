## createAgent里面注册多个 tools，是模型自己决定使用哪个tool还是代码编写逻辑决定使用哪个tools
在 createAgent({ tools: [...] }) 这个模式下， 选择权完全在模型手里 。代码只是提供了“选项菜单”，只是负责把工具摆在它面前，并承诺“你想用哪个我都帮你跑腿的腿，我帮你跑”

### 1. 模型如何做决定？
当你把多个 Tools（比如 search_tool , calculator_tool , weather_tool ）传给 Agent 时，LangChain 会做以下几件事：
1. 生成说明书 ：LangChain 会把这 3 个工具的 name （名字）、 description （功能描述）和 schema （参数格式）打包成一段文本。
2. 注入 Prompt ：它把这段“工具说明书”塞进 System Prompt 里，告诉模型： "你有一组工具可以使用。如果需要，请生成一个 JSON 来调用它们。如果你不需要工具，就直接回答。"
3. 模型推理 (Reasoning) ：
   - 用户问：“明天北京下雨吗？” -> 模型看说明书 -> 发现 weather_tool 能查天气 -> 决定调用 weather_tool 。
   - 用户问：“389 乘以 12 等于多少？” -> 模型看说明书 -> 发现 calculator_tool 能算数 -> 决定调用 calculator_tool 。
   - 用户问：“你好。” -> 模型判断不需要工具 -> 直接回答“你好” 。
### 2. 代码能干预吗？
虽然主要是模型决定，但代码可以通过以下方式“引导”或“强制”：
- Prompt 引导 ：在 System Prompt 里写死：“遇到任何问题，优先使用搜索工具”。
- Tool Description ：把工具描述写得非常有诱惑力，比如“只要用户问到任何事实性问题，必须使用此工具”。
- 强制调用 (tool_choice) ：在 OpenAI API 里可以设置 tool_choice: "required" 或指定某个 tool 的名字，强制模型必须用某个工具（但这通常就不叫 Agent 了，叫强制执行）。
### 3. 为什么有时候模型选错？
- 描述不清 ：如果两个工具描述相似（比如 search_baidu 和 search_google ），模型可能随机选。
- 模型太笨 ：小参数模型（如 7B 以下）可能看不懂复杂的工具描述，或者逻辑推理能力差，导致乱选。
- Prompt 污染 ：System Prompt 里其他的指令干扰了它对工具的判断。
