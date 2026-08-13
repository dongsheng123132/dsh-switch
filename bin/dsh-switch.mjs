#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { chooseBest, probeAll, validateProbeConfig } from '../lib/probe.mjs'

const argv = process.argv.slice(2)
const command = argv[0] || 'help'
const configIndex = argv.indexOf('--config')
const configPath = configIndex === -1 ? 'providers.json' : argv[configIndex + 1]
const asJson = argv.includes('--json')

async function loadConfig() {
  if (!configPath) throw new Error('--config requires a path')
  return validateProbeConfig(JSON.parse(await readFile(configPath, 'utf8')))
}

function printResults(results) {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2))
    return
  }
  for (const result of results) {
    const mark = result.healthy ? '✓' : result.reachable ? '!' : '✗'
    const detail = result.status === null ? result.error : `HTTP ${result.status}`
    const models = result.modelCount === null ? '' : `, ${result.modelCount} models`
    console.log(`${mark} ${result.id.padEnd(24)} ${String(result.latencyMs).padStart(7)} ms  ${detail}${models}  credential:${result.credential}`)
  }
}

switch (command) {
  case 'check': {
    const config = await loadConfig()
    const results = await probeAll(config)
    printResults(results)
    if (!results.some(result => result.healthy)) process.exitCode = 2
    break
  }
  case 'best': {
    const config = await loadConfig()
    const results = await probeAll(config)
    const best = chooseBest(results)
    if (asJson) console.log(JSON.stringify({ best, results }, null, 2))
    else if (best) console.log(best.id)
    else console.error('No healthy provider endpoint.')
    if (!best) process.exitCode = 2
    break
  }
  case 'validate': {
    const config = await loadConfig()
    if (asJson) console.log(JSON.stringify({ ok: true, providers: config.providers.length }))
    else console.log(`OK: ${config.providers.length} providers`)
    break
  }
  case 'help':
    console.log(`dsh-switch <command> [options]\n\nCommands:\n  validate   Validate provider probe config without network access\n  check      Probe every provider's models endpoint\n  best       Print the lowest-latency healthy provider id\n\nOptions:\n  --config <path>  Config path (default providers.json)\n  --json           Emit JSON\n\nSecrets are referenced through apiKeyEnv. Embedded apiKey values are rejected.`)
    break
  default:
    throw new Error(`unknown command: ${command}`)
}

