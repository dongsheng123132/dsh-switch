import assert from 'node:assert/strict'
import { apply, createDefinitions } from '../index.js'

const registered = []
let selection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const providers = [
  { id: 'deepseek-official', name: 'DeepSeek', description: 'Official route' },
  { id: 'local', name: 'Local', description: 'Local route' }
]
const ctx = {
  tools: { register: definition => registered.push(definition) },
  llm: {
    listProviders: () => providers,
    listModels: async provider => [{ provider, id: provider === 'local' ? 'local-model' : 'deepseek-v4-flash', name: 'Model' }],
    resolveModelInfo: async (provider, model) => ({
      provider,
      id: model,
      name: model,
      inputModalities: ['text'],
      context: { contextWindow: 131072 },
      reasoning: { efforts: [{ id: 'high', name: 'High' }] }
    })
  },
  agentDefaultModel: {
    currentSelection: () => ({ ...selection }),
    saveSelection: async next => { selection = { ...next } }
  }
}

const definitions = createDefinitions(ctx)
assert.deepEqual(definitions.map(item => item.name), ['dsh_switch_status', 'dsh_switch_default'])
apply(ctx)
assert.equal(registered.length, 2)

const status = definitions.find(item => item.name === 'dsh_switch_status')
const statusValue = await status.execute({ includeModels: true }, { signal: new AbortController().signal })
assert.equal(statusValue.providers.length, 2)
assert.equal(statusValue.providers[1].models[0].id, 'local-model')

const switchDefault = definitions.find(item => item.name === 'dsh_switch_default')
const switched = await switchDefault.execute({
  provider: 'local',
  model: 'local-model',
  reasoningEffort: 'high',
  expectedProvider: 'deepseek-official',
  expectedModel: 'deepseek-v4-flash'
}, { signal: new AbortController().signal })
assert.equal(switched.current.provider, 'local')
assert.equal(switched.effect, 'new-sessions-only')

await assert.rejects(() => switchDefault.execute({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  expectedProvider: 'stale',
  expectedModel: 'stale'
}, { signal: new AbortController().signal }), /default model changed/)

console.log(JSON.stringify({ ok: true, tools: registered.map(item => item.name), selection }))

