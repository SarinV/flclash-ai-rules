# FLClash AI Rules

面向 Mihomo/Clash `rule-provider` 的小型 AI 规则仓库。仓库只保存公开规则数据和生成程序，不包含任何本地订阅、代理地址、密码或 FLClash 配置。

## 生成物

- [`rules/openai.yaml`](rules/openai.yaml)：MetaCubeX OpenAI 规则与 OpenAI 官方网络依赖的并集，`behavior: classical`
- [`rules/copilot.yaml`](rules/copilot.yaml)：GitHub/Microsoft Copilot 专属端点，`behavior: classical`
- [`rules/chatgpt-voice-ipcidr.yaml`](rules/chatgpt-voice-ipcidr.yaml)：OpenAI 官方 Voice IP 前缀，`behavior: ipcidr`
- [`metadata.json`](metadata.json)：上游内容哈希、规则数量和月度维护心跳

Raw URLs:

```text
https://raw.githubusercontent.com/SarinV/flclash-ai-rules/main/rules/openai.yaml
https://raw.githubusercontent.com/SarinV/flclash-ai-rules/main/rules/copilot.yaml
https://raw.githubusercontent.com/SarinV/flclash-ai-rules/main/rules/chatgpt-voice-ipcidr.yaml
```

## 上游

- [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)
- [OpenAI 网络建议](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps)
- [OpenAI ChatGPT Voice IP JSON](https://openai.com/chatgpt-voice.json)
- [GitHub Copilot allowlist reference](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference)
- [GitHub Docs 源文件](https://github.com/github/docs/blob/main/content/copilot/reference/copilot-allowlist-reference.md)

OpenAI Help Center 有时会对自动请求返回 HTTP 403。生成器会优先尝试解析实时页面；不可用时，使用仓库内经人工核对的官方域名基线，并继续合并正在维护的 MetaCubeX OpenAI 数据。Voice IP 始终直接来自 OpenAI 官方 JSON。

## 自动维护

GitHub Actions 每 6 小时错峰运行一次，并支持手动触发。生成器采用以下保护：

- 上游请求超时和重试
- 最小规则数量、CIDR 格式和危险规则类型校验
- 上游异常时失败退出，不用空文件覆盖上一版
- Copilot 只提取专属端点，不把通用 `github.com`、`api.github.com` 或整个 Microsoft 365 域名纳入
- 每月更新一次心跳字段，防止公开仓库因长期无提交而停用定时工作流
- 工作流权限仅为 `contents: write`

本仓库的 Voice IP 文件只是数据源，不代表应当全局开放 STUN。建议只在确认规则优先级后，以 `UDP + 目标端口 3478 + 官方 IP 集合` 的交集规则使用。
