// Sync-readiness drift check: validates our static schedule against the LIVE
// upstream cup.txt, so a name/structure change there is caught BEFORE it silently
// breaks an autofill sync (the way "Türkiye" vs cup.txt "Turkey" did). The unit
// test (test/sync-coverage.test.js) guards against a frozen snapshot; this guards
// against upstream drift. Reuses the same cupName aliases the writer uses.
//
// Exit 0 if every group match is locatable, 1 if any isn't (so it can gate a CI/
// cron job and email when upstream drifts). Knockout matches are skipped — their
// cup.txt lines hold placeholders ("Winner Group A") until teams resolve.
//
// Run:  node scripts/check-sync-readiness.mjs   (alias: npm run check:sync)

import { MATCHES } from '../src/data/matches.js'
import { cupName } from './cuptxt.mjs'

const CUP_URL = 'https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (n) => new RegExp(`(^|[ \\t])${esc(n)}([ \\t]|$)`)

function locatable(lines, a, b) {
  return lines.some(
    (l) => /^[ \t]*\d{1,2}:\d{2}[ \t]+UTC/.test(l) && word(a).test(l) && word(b).test(l),
  )
}

async function main() {
  let cup
  try {
    const res = await fetch(CUP_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    cup = await res.text()
  } catch (err) {
    console.error(`✖ Could not fetch upstream cup.txt: ${err.message}\n  ${CUP_URL}`)
    process.exit(2)
  }
  const lines = cup.split(/\r?\n/)
  const group = MATCHES.filter((m) => m.stage === 'Group')
  const missing = group.filter((m) => !locatable(lines, cupName(m.t1), cupName(m.t2)))

  console.log('Sync readiness — cup.txt name/line coverage')
  console.log(`  ${group.length - missing.length}/${group.length} group matches locatable in upstream cup.txt`)

  if (missing.length) {
    console.log('\n⚠ DRIFT — these group matches can NOT be located in cup.txt under our names,')
    console.log('  so the autofill would silently skip them. Add/adjust a cupName alias in')
    console.log('  scripts/cuptxt.mjs (our spelling → cup.txt spelling):\n')
    for (const m of missing) {
      console.log(`  ✖ ${m.t1} v ${m.t2}   →   looked for "${cupName(m.t1)}" / "${cupName(m.t2)}"`)
    }
    console.log()
    process.exit(1)
  }
  console.log('  All group matches are locatable. ✓\n')
}

main()
