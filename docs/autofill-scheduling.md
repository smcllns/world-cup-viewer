# Autofill scheduling & reliability

How `OpenFootball autofill` (`.github/workflows/openfootball-autofill.yml`) gets a
confirmed final into `openfootball/worldcup` within minutes of a match ending —
reliably, despite GitHub Actions' unreliable scheduler.

## The problem

GitHub Actions `schedule` triggers are explicitly best-effort. A `*/5` cron is
throttled hard, and even `*/15` was observed firing only **~once every 2 hours**.
A match's result needs to be polled for during a fairly narrow window (full time
+ source confirmation), so a scheduler that might not fire for 2 hours can miss a
game's window entirely.

## The design (layers)

1. **Match-window gating** — `scripts/active-window.mjs` (`windowStatus`) decides
   if "now" is inside any match's finishing window, `[kickoff + 85 min, kickoff +
   180 min]` (late second half → ~full time + ~60 min for the slowest source).
   The job only does real work inside a window; otherwise it exits in seconds.

2. **Sleep-until-window loop** — when triggered, the job doesn't just check once;
   it *sleeps until* the next window (up to a ~5h budget), polls every ~5 min
   through it, then moves on. So a single trigger landing anywhere in the ~5h
   before a game covers it — GitHub only has to fire occasionally, not on time.

3. **Self-perpetuating chain** — before finishing, a loop run **re-dispatches the
   next one** (`gh workflow run … -f babysit=true`) as long as another window is
   within ~5.5h. During a match day the chain sustains itself with no dependence
   on the scheduler at all. It rests during long overnight gaps.

4. **Schedule backstop** — the `*/15` cron exists only to **restart the chain**
   after it rests (before the next day's games). It doesn't need to be timely;
   one firing in the few hours before a match day is enough.

5. **Concurrency** — all loop runs (schedule + chain) share one concurrency group
   (`…-loop`, `cancel-in-progress: false`), so only one polls at a time and the
   chain never doubles up; queued triggers just refresh the single pending run.
   Quick manual runs (test email, one-off sync) get a unique group and never wait
   behind a multi-hour loop.

Net: confirmed finals sync within ~5 min of being confirmed, the job barely runs
when no game is finishing, and a flaky scheduler can't cause a miss.

## Manual controls (`workflow_dispatch` inputs)

- **`babysit`** — run the long sleep-until-window loop now (covers upcoming
  windows for up to ~5h). Used to *guarantee* coverage for a specific game (e.g.
  an overnight one) without waiting on the scheduler.
- **`dry_run`** — run the sync once, preview only, push nothing.
- **`test_email`** — send a test notification email and exit.

## Observing it

```bash
gh run list --workflow "OpenFootball autofill"          # during a window you'll
                                                        # see a long in_progress run
gh run view <id> --log | grep -E "sleeping|ACTIVE|re-dispatch"
node scripts/active-window.mjs                          # ACTIVE <secs> | IDLE <secs>
```

## Optional: a truly external trigger (belt-and-suspenders)

The chain + backstop is reliable in practice, but its one residual dependency is
that GitHub fires the `*/15` schedule *sometime* in the hours before each match
day to restart the chain. To remove even that, point an external cron at the
workflow's dispatch API every ~5 min (it's cheap — the job exits in seconds when
no window is active):

- **cron-job.org** (free): a job that `POST`s to
  `https://api.github.com/repos/ismayc/world-cup-viewer/actions/workflows/openfootball-autofill.yml/dispatches`
  with header `Authorization: Bearer <PAT>` (a fine-grained PAT with **Actions:
  write** on this repo) and body `{"ref":"main"}`.
- **Netlify scheduled function** (uses the existing deploy): a function on a
  `*/5` cron that does the same dispatch, with the PAT in a Netlify env var.

Either makes the trigger fully reliable; the in-repo logic (window gating, loop,
notifications) is unchanged. Not required — the chain covers the normal case.
