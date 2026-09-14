import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const roots = ['api', 'db']

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }
  return files
}

const files = (await Promise.all(roots.map(collectJsFiles))).flat().sort()
let failed = false

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) failed = true
}

if (failed) process.exit(1)
console.log(`Checked ${files.length} serverless JavaScript files.`)
