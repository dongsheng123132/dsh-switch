import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const required = [
  'index.js',
  'cordis.patch.yml',
  'providers.example.json',
  'README.md',
  'README.zh-CN.md',
  'LICENSE'
]
for (const path of required) await access(new URL(path, root))

const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('package.json must declare dsh.bundle.patch')
if (manifest.scripts?.prepare || manifest.scripts?.postinstall) throw new Error('install lifecycle scripts are forbidden')

const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
if (!patch.includes('name: dsh-switch')) throw new Error('bundle patch does not mount dsh-switch')

const plugin = await readFile(new URL('index.js', root), 'utf8')
for (const tool of ['dsh_switch_status', 'dsh_switch_default']) {
  if (!plugin.includes(tool)) throw new Error(`missing tool: ${tool}`)
}
if (/(sk-|api[_-]?key\s*[:=]\s*["'][^"']+)/i.test(plugin)) throw new Error('possible embedded credential in plugin source')

console.log(JSON.stringify({ ok: true, bundle: manifest.dsh.bundle.patch, tools: 2, installScripts: 0 }))

