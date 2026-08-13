# dsh-switch

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的证据优先模型控制面。

[English](README.md)

`dsh-switch` 刻意把两件事分开：

1. DSH bundle 提供模型工具：读取已经注册的 provider、通过官方 `ctx.llm` 验证精确的 provider/model，再通过 `ctx.agentDefaultModel` 保存**新会话**默认值。
2. 独立 CLI 探测 OpenAI-compatible `/models` 端点，报告可达性、HTTP 状态、延迟、模型数量和凭据环境变量是否已配置。

它不拦截模型请求、不再造一个 OpenAI adapter，也不静默改正在运行的会话。`dsh-polyglot`、`dsh-llm-fallbacks` 等项目负责 adapter/fallback；本项目负责 DSH 已有路由之外的可观察控制面。

## 安装 DSH bundle

从 GitHub 安装时请固定审查过的 commit：

```bash
dsh plugin --profile web add github:dongsheng123132/dsh-switch#<commit>
dsh --profile web --dump-config
```

本 bundle 直接交付 JavaScript，没有安装/构建生命周期脚本。

### 工具

`dsh_switch_status({ includeModels? })`

- 显示新会话采用的默认模型；
- 列出已经注册的 provider route；
- 可选读取每个 adapter 公布的模型目录；
- 自身不发送 provider 网络健康请求。

`dsh_switch_default({ provider, model, reasoningEffort?, expectedProvider?, expectedModel? })`

- 先用 `ctx.llm.resolveModelInfo()` 验证精确路由；
- 拒绝不支持的 reasoning effort；
- 支持 expected pair 乐观并发检查；
- 只通过 `ctx.agentDefaultModel.saveSelection()` 写入；
- 写后回读，不可观察就报错；
- 只影响新会话。已有会话继续使用日志里已经记录的路由。

## 探测 provider 端点

把 [`providers.example.json`](providers.example.json) 复制到不入库的本地文件，例如 `providers.json`。JSON 只写环境变量名，绝不写密钥值。

```bash
node bin/dsh-switch.mjs validate --config providers.json
node bin/dsh-switch.mjs check --config providers.json
node bin/dsh-switch.mjs best --config providers.json
node bin/dsh-switch.mjs check --config providers.json --json
```

示例：

```text
✓ deepseek-official          83.4 ms  HTTP 200, 2 models  credential:configured
✗ local-vllm                 1.2 ms  network-error  credential:not-required
```

探针发送 `GET <baseURL><modelsPath>`，不发送对话请求，因此不消耗推理 Token。`/models` 成功只证明端点可达，不等于端到端生成一定正确。

## 安全与证据边界

- 拒绝 `apiKey` 字段和 URL 内嵌凭据。
- 输出只出现 `configured`、`missing` 或 `not-required`，不返回密钥值。
- 401/403 表示端点可达但不健康。
- DSH 工具切换验证的是 adapter 元数据，不是假装做过 provider 网络 I/O。
- v0.1 不启用自动 fallback 或按成本路由。

## 开发

```bash
npm test
npm run check
```

插件 smoke test 需要能解析官方 DSH runtime 包：

```bash
npm run smoke:plugin
```

## 许可证

MIT © 2026 hfshfg

