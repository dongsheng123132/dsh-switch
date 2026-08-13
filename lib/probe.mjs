import { performance } from 'node:perf_hooks'

const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/

export function validateProbeConfig(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.providers)) {
    throw new Error('config must contain a providers array')
  }
  const seen = new Set()
  return {
    providers: value.providers.map((provider, index) => {
      if (!provider || typeof provider !== 'object') throw new Error(`providers[${index}] must be an object`)
      if (typeof provider.id !== 'string' || !PROVIDER_ID.test(provider.id)) {
        throw new Error(`providers[${index}].id must match ${PROVIDER_ID}`)
      }
      if (seen.has(provider.id)) throw new Error(`duplicate provider id: ${provider.id}`)
      seen.add(provider.id)

      let baseURL
      try {
        baseURL = new URL(provider.baseURL)
      } catch {
        throw new Error(`providers[${index}].baseURL must be an absolute URL`)
      }
      if (!['http:', 'https:'].includes(baseURL.protocol)) {
        throw new Error(`providers[${index}].baseURL must use http or https`)
      }
      if (baseURL.username || baseURL.password) {
        throw new Error(`providers[${index}].baseURL must not contain credentials`)
      }
      if (baseURL.search || baseURL.hash) {
        throw new Error(`providers[${index}].baseURL must not contain query parameters or a fragment`)
      }

      const apiKeyEnv = provider.apiKeyEnv
      if (apiKeyEnv !== undefined && (typeof apiKeyEnv !== 'string' || !ENV_NAME.test(apiKeyEnv))) {
        throw new Error(`providers[${index}].apiKeyEnv must be an uppercase environment variable name`)
      }
      if ('apiKey' in provider) throw new Error(`providers[${index}] must reference apiKeyEnv, never embed apiKey`)

      const modelsPath = provider.modelsPath ?? '/models'
      if (typeof modelsPath !== 'string' || !modelsPath.startsWith('/') || modelsPath.startsWith('//')) {
        throw new Error(`providers[${index}].modelsPath must be an absolute URL path`)
      }
      const timeoutMs = provider.timeoutMs ?? 5000
      if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
        throw new Error(`providers[${index}].timeoutMs must be an integer from 100 to 120000`)
      }
      return { id: provider.id, baseURL: baseURL.toString(), apiKeyEnv, modelsPath, timeoutMs }
    })
  }
}

export async function probeProvider(provider, { env = process.env, fetchImpl = fetch } = {}) {
  const endpoint = new URL(provider.baseURL)
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}${provider.modelsPath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs)
  const apiKey = provider.apiKeyEnv ? env[provider.apiKeyEnv] : undefined
  const started = performance.now()
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal
    })
    const latencyMs = Math.round((performance.now() - started) * 10) / 10
    const reachable = true
    const healthy = response.ok
    let modelCount = null
    if (healthy) {
      try {
        const body = await response.json()
        modelCount = Array.isArray(body?.data) ? body.data.length : null
      } catch {
        modelCount = null
      }
    } else {
      await response.body?.cancel()
    }
    return {
      id: provider.id,
      healthy,
      reachable,
      status: response.status,
      latencyMs,
      modelCount,
      credential: provider.apiKeyEnv ? (apiKey ? 'configured' : 'missing') : 'not-required'
    }
  } catch (error) {
    const latencyMs = Math.round((performance.now() - started) * 10) / 10
    return {
      id: provider.id,
      healthy: false,
      reachable: false,
      status: null,
      latencyMs,
      modelCount: null,
      credential: provider.apiKeyEnv ? (apiKey ? 'configured' : 'missing') : 'not-required',
      error: error?.name === 'AbortError' ? 'timeout' : 'network-error'
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeAll(config, options = {}) {
  const validated = validateProbeConfig(config)
  return Promise.all(validated.providers.map(provider => probeProvider(provider, options)))
}

export function chooseBest(results) {
  return [...results]
    .filter(result => result.healthy)
    .sort((left, right) => left.latencyMs - right.latencyMs || left.id.localeCompare(right.id))[0] ?? null
}
