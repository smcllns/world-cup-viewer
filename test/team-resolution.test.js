import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MATCHES } from '../src/data/matches.js'
import { normEspn, ESPN_ALIASES } from '../src/services/espn.js'
import { normSdb, SDB_ALIASES } from '../src/services/thesportsdb.js'
import { normalizeTeam } from '../src/services/results.js'
import { ESPN_ALIASES as ESPN_ALIASES_CUPTXT, cupName } from '../scripts/cuptxt.mjs'

// The two production bugs (Türkiye→Turkey, and TheSportsDB's "Bosnia-Herzegovina")
// were both an external feed spelling that no normalizer mapped to our canonical
// name — so a lookup silently returned a non-team and the match was dropped. These
// tests pin every REAL captured feed spelling to a real team. Re-capture the
// fixtures (see commands in the PR) as more teams appear in the feeds.

const here = dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(resolve(here, 'fixtures', f), 'utf8'))
const espnNames = load('espn-team-names.json')
const sdbNames = load('sdb-team-names.json')

// Canonical team names = the (real) names our schedule uses.
const canonical = new Set(
  MATCHES.flatMap((m) => [m.t1, m.t2]).filter((t) => t === normalizeTeam(t) && !/^(Winner|Runner|Group|[0-9])/.test(t)),
)

describe('team name resolution from real feed spellings', () => {
  it('every ESPN spelling resolves to a real team', () => {
    const bad = espnNames.filter((n) => !canonical.has(normEspn(n))).map((n) => `${n} → ${normEspn(n)}`)
    expect(bad, `ESPN spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('every TheSportsDB spelling resolves to a real team', () => {
    const bad = sdbNames.filter((n) => !canonical.has(normSdb(n))).map((n) => `${n} → ${normSdb(n)}`)
    expect(bad, `TheSportsDB spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('regression: TheSportsDB "Bosnia-Herzegovina" resolves (was an unmapped gap)', () => {
    expect(normSdb('Bosnia-Herzegovina')).toBe('Bosnia & Herzegovina')
    expect(canonical.has(normSdb('Bosnia-Herzegovina'))).toBe(true)
  })

  it('regression: official names resolve to cup.txt spellings via cupName', () => {
    expect(cupName('Türkiye')).toBe('Turkey')
    expect(cupName('Czechia')).toBe('Czech Republic')
  })
})

describe('alias tables stay in sync (no silent drift between copies)', () => {
  it('the ESPN alias map in cuptxt.mjs matches the one in espn.js', () => {
    // cuptxt.mjs keeps a copy used by the autofill's ESPN parsing; if it drifts
    // from the live overlay's copy, a fix lands in one source but not the other.
    expect(ESPN_ALIASES_CUPTXT).toEqual(ESPN_ALIASES)
  })

  it('ESPN and TheSportsDB alias maps cover the same divergent teams', () => {
    // Both feeds use the same off-spellings for the diacritic/multi-word teams;
    // a target present in one map but absent in the other is a likely gap.
    const targets = (m) => new Set(Object.values(m))
    expect(targets(SDB_ALIASES)).toEqual(targets(ESPN_ALIASES))
  })
})
