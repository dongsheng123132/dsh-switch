# dsh-switch

> Evidence-first model control plane for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

[中文](README.zh-CN.md)

`dsh-switch` does two deliberately separate jobs:

1. The DSH bundle exposes model-facing tools that inspect registered provider routes, validate an exact provider/model through the official `ctx.llm` seam, and save the default for **new sessions** through `ctx.agentDefaultModel`.
2. The standalone CLI probes OpenAI-compatible `/models` endpoints and reports reachability, HTTP status, latency, model count, and whether a credential environment variable is configured.

It does not intercept model requests, implement another OpenAI adapter, or silently reroute an active session. Projects such as `dsh-polyglot` and `dsh-llm-fallbacks` own adapter/fallback behavior; this project is the observable control plane around routes DSH already knows.

## Install the DSH bundle

Pin a reviewed commit when installing from GitHub:

```bash
dsh plugin --profile web add github:dongsheng123132/dsh-switch#<commit>
dsh --profile web --dump-config
```

The bundle ships JavaScript and has no install/build lifecycle script.

### Tools

`dsh_switch_status({ includeModels? })`

- shows the default selection used by newly created sessions;
- lists registered provider routes;
- optionally asks each adapter for its advertised models;
- performs no provider network health request itself.

`dsh_switch_default({ provider, model, reasoningEffort?, expectedProvider?, expectedModel? })`

- validates the exact route with `ctx.llm.resolveModelInfo()`;
- rejects an unsupported reasoning effort;
- supports an optimistic-concurrency expectation pair;
- saves through `ctx.agentDefaultModel.saveSelection()`;
- reads the value back and fails if the write is not observable;
- affects new sessions only. Existing sessions keep the route recorded in their logs.

## Probe provider endpoints

Copy [`providers.example.json`](providers.example.json) to a private local file such as `providers.json`. Reference secrets by environment-variable name—never place keys in JSON.

```bash
node bin/dsh-switch.mjs validate --config providers.json
node bin/dsh-switch.mjs check --config providers.json
node bin/dsh-switch.mjs best --config providers.json
```

JSON output:

```bash
node bin/dsh-switch.mjs check --config providers.json --json
```

Example output:

```text
✓ deepseek-official          83.4 ms  HTTP 200, 2 models  credential:configured
✗ local-vllm                 1.2 ms  network-error  credential:not-required
```

The probe sends `GET <baseURL><modelsPath>`. It does not send a chat completion and therefore does not consume inference tokens. A successful `/models` response proves endpoint reachability, not end-to-end generation correctness.

## Security and evidence boundaries

- `apiKey` fields and credentials embedded in URLs are rejected.
- Output contains only `configured`, `missing`, or `not-required`; secret values never enter results.
- A 401/403 endpoint is reachable but not healthy.
- DSH tool switching validates registered adapter metadata, not live provider I/O.
- No automatic fallback or cost-based routing is enabled in v0.1.

## Development

```bash
npm test
npm run check
```

The plugin smoke test requires the official DSH runtime packages to be resolvable:

```bash
npm run smoke:plugin
```

## License

MIT © 2026 hfshfg

