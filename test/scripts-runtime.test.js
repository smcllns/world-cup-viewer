import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The autofill workflow runs the scripts WITHOUT `npm ci` (to keep the frequent
// window checks cheap), so their entire import graph must use only Node built-ins
// and in-repo source — never an npm package. This walks the graph and fails if a
// bare (package) specifier ever sneaks in.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function specifiersOf(file) {
  if (!existsSync(file)) return []
  const src = readFileSync(file, 'utf8')
  const specs = []
  for (const re of [
    /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    let m
    while ((m = re.exec(src))) specs.push(m[1])
  }
  return specs
}

function resolveRelative(fromFile, spec) {
  const p = resolve(dirname(fromFile), spec)
  if (existsSync(p)) return p
  for (const ext of ['.js', '.mjs', '/index.js']) if (existsSync(p + ext)) return p + ext
  return null
}

function bareSpecifiersReachableFrom(entry) {
  const seen = new Set()
  const bare = new Set()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of specifiersOf(file)) {
      if (spec.startsWith('node:')) continue
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec)
        expect(target, `unresolved relative import "${spec}" in ${file}`).not.toBeNull()
        stack.push(target)
      } else {
        bare.add(spec) // an npm package — not allowed
      }
    }
  }
  return [...bare]
}

describe('autofill scripts have zero npm dependencies', () => {
  for (const entry of ['scripts/openfootball-autofill.mjs', 'scripts/active-window.mjs']) {
    it(`${entry} and everything it imports is node:/repo-only`, () => {
      expect(bareSpecifiersReachableFrom(resolve(root, entry))).toEqual([])
    })
  }
})
