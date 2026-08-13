import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chooseBest, probeAll, validateProbeConfig } from '../lib/probe.mjs'

async function withServer(handler, run) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await run(`http://127.0.0.1:${port}/v1`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('configuration rejects embedded secrets and duplicate ids', () => {
  assert.throws(() => validateProbeConfig({ providers: [{ id: 'x', baseURL: 'https://u:p@example.com' }] }), /must not contain credentials/)
  assert.throws(() => validateProbeConfig({ providers: [
    { id: 'x', baseURL: 'https://example.com' },
    { id: 'x', baseURL: 'https://example.org' }
  ] }), /duplicate provider id/)
  assert.throws(() => validateProbeConfig({ providers: [{ id: 'x', baseURL: 'https://example.com', apiKey: 'secret' }] }), /never embed apiKey/)
})

test('probe reports status, latency and model count without exposing the credential', async () => {
  await withServer((request, response) => {
    assert.equal(request.url, '/v1/models')
    assert.equal(request.headers.authorization, 'Bearer top-secret')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }))
  }, async baseURL => {
    const results = await probeAll({ providers: [{ id: 'local', baseURL, apiKeyEnv: 'TEST_KEY' }] }, {
      env: { TEST_KEY: 'top-secret' }
    })
    assert.equal(results[0].healthy, true)
    assert.equal(results[0].status, 200)
    assert.equal(results[0].modelCount, 2)
    assert.equal(JSON.stringify(results).includes('top-secret'), false)
  })
})

test('probe distinguishes a reachable error from a network failure', async () => {
  await withServer((_request, response) => {
    response.writeHead(503)
    response.end('down')
  }, async baseURL => {
    const [result] = await probeAll({ providers: [{ id: 'down', baseURL }] })
    assert.equal(result.reachable, true)
    assert.equal(result.healthy, false)
    assert.equal(result.status, 503)
  })

  const [unreachable] = await probeAll({ providers: [{ id: 'offline', baseURL: 'http://127.0.0.1:1', timeoutMs: 250 }] })
  assert.equal(unreachable.reachable, false)
  assert.equal(unreachable.status, null)
})

test('chooseBest selects only healthy endpoints and uses latency ordering', () => {
  assert.deepEqual(chooseBest([
    { id: 'bad', healthy: false, latencyMs: 1 },
    { id: 'slow', healthy: true, latencyMs: 30 },
    { id: 'fast', healthy: true, latencyMs: 10 }
  ]), { id: 'fast', healthy: true, latencyMs: 10 })
  assert.equal(chooseBest([{ id: 'bad', healthy: false, latencyMs: 1 }]), null)
})
