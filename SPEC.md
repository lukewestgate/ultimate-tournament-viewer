# Ultimate Tournament Viewer — Spec

An unofficial, mobile-first companion site for UKU tournaments. It reads the tournament
director's published Google Sheet and presents the same data in a clearer form: what's on
now, what's next, per-team schedules, pool tables, visual brackets, and "who could I play
next?" projections. Installable as a PWA. The sheet is always the source of truth; the site
only reads it.

First target: **Yorkshire & East Mids University Mixed Indoor Regionals**,
Sat 31 Oct – Sun 1 Nov 2026.

---

## 1. Goals and non-goals

### Goals
1. **Now / Next.** At a glance: which games are in progress, on which pitch, and which are next.
2. **Search.** Find any team, game, pitch or time slot quickly.
3. **Team view.** Pick a team (and optionally save it as "my team") to see only that team's games, results and next game.
4. **Projections / what-if.** For any team, show which games it could play next depending on its own results and other teams' results. Let the user tap hypothetical winners and see everything downstream update.
5. **Brackets.** Clear, attractive bracket graphics that work on phones and desktops.
6. **Live-ish data.** Auto-refresh from the sheet (polling) with no manual reload.
7. **PWA.** Installable, quick to load, works offline using the last known data.

### Non-goals (v1)
- No writing to the sheet (score entry stays with the TD).
- No accounts, no backend database.
- No push notifications. These need a server (see §11 Future).
- No official UKU branding. The footer reads: *"Unofficial viewer — data from the tournament's published schedule."*

---

## 2. Source data

### 2.1 Endpoints

The sheet is "published to the web". Publish ID:

```
2PACX-1vQF79upDfQ5BpZpN-4eSZ22OzcppoHSs8U4lfVUPMQIs8OOKu9-Z4oA8qBxZRVBR0bWuwHhaaBWUNk8
```

| Purpose | URL | CORS |
|---|---|---|
| Tab list (HTML) | `https://docs.google.com/spreadsheets/d/e/{publishId}/pubhtml` | **No** |
| One tab as CSV | `https://docs.google.com/spreadsheets/d/e/{publishId}/pub?gid={gid}&single=true&output=csv` | **Yes** (`Access-Control-Allow-Origin: *`, after a 307 redirect to `*.googleusercontent.com`) |

Consequences:
- The browser can fetch the CSVs directly, so the site can be **purely static**.
- The browser can't read the tab list. Tab gids go in a per-tournament config file, produced by a small Node script (`scripts/discover-tabs.ts`) that scrapes `pubhtml` for `items.push({name: "...", ... gid: "..."})`.
- The CSV response carries `Cache-Control: private, max-age=300`, so every request appends a cache-buster (`&_=<timestamp>`).
- Google's published copy can lag the live sheet by **up to ~5 minutes**. The UI must not promise more than "updated a few minutes ago".

### 2.2 Tabs (this tournament)

| Tab | gid | Used for | Poll frequency |
|---|---|---|---|
| Header | 304455124 | Title, announcements, rules, game lengths, qualification spots, SOTG form link | every poll |
| Seeding and Pools | 646683490 | Seeds 1–16, team names, slot→seed map (A1…H4) | on load + every 10 min |
| Schedule | 0 | Grid view only; also day dates and slot lengths | on load + every 10 min |
| Pool Results | 366787109 | Pool tables (W/L/D/Pts/Rank), "Carried result" rows, pool-finish→seed map | every poll |
| Brackets | 374600150 | `1E → 1` style arrows (power-pool finish → Sunday seed), qualification markers | on load + every 10 min |
| **Gamelist** | 2039993329 | **The main source for every game** (time, pitch, slots, resolved team names, scores) | every poll |
| Final Standings | 707391525 | Final ranks 1–16 | every poll on Sunday |
| SOTG submissions | 2138120578 | Spirit form submission counts per team | every 5 min |

### 2.3 Tab layouts (as observed on 30 Oct 2026)

Parsers find tables **by header labels, not by fixed cell addresses**. They must tolerate
blank rows and columns, `#N/A`, trailing whitespace (`"DRAFT "`), and stray `X` markers.

**Gamelist.** Header row: `Game, Slot, Day, Time, Pitch, Team, , v, , Team, Division, left team, right team, is this a bracket game?, …`
- Col A `Game`: game code: `A1vA3` (pool), `E1vE3` (power pool), `8v9` (Sunday placement), `[4v5]` (game-to-go).
- Col C `Day`: `Saturday` / `Sunday`. Col D `Time`: `HH:MM`. Col E `Pitch`: `1`–`3`.
- Col F and Col J: resolved team names. These are **blank until the sheet can resolve them** (e.g. power-pool and Sunday games before results are in).
- Col G and Col I: **assumed to be the score cells** (see Open Question 1).
- Col L / M: left and right slot codes (`A1`, `E3`, `8`, `9`).
- Col N: `TRUE` for bracket games.
- The remaining columns are the sheet's own resolution helpers. Ignore them.
- Row order is stable and sorted by day and time. Keep the row index as a stable game ordinal.

**Pool Results.** Repeating blocks per pool (A–H):
- The block header row has the pool letter in col B.
- Left table: `Game code | Team | Score | v | Score | Team | "Saturday 09:30 - Pitch 1"` or `"Carried result"`.
- Middle table: `Pool | Seed | Team | W | L | D | Pts | Rank`.
- Right side: `1A, 1` pairs, meaning finishing position → seed.
- Power pools E–H each have two `Carried result` rows. The earlier pool game between those two teams counts towards the power-pool table.

**Seeding and Pools.** Seeds 1–16 with team names (cols B–C). Slot table (cols F–H): `A1 → seed 1 → Loughborough 1` … `E1 → seed 1`, `E2 → seed 3`, … `H4 → seed 16`.

**Brackets.** Box-drawing ASCII art. Do **not** render this tab. Only extract:
- Arrow cells `<pos><pool> → <seed>` (e.g. `1E → 1`, `4F → 8`), which map power-pool finish to Sunday seed.
- Qualification markers `Q` (Div 1) and `q` (Div 2).

**Header.** Free text in col A, with occasional `key, value` pairs in col B:
- Row 1 `DRAFT`: while present, show a "Draft schedule — may change" banner.
- Row 2: tournament name.
- Row 3: SOTG form URL.
- `Announcements` section: the lines up to the next blank-run or section title. Show them prominently when non-empty.
- `Qualification`: `Div 1 = 4`, `Div 2 = 3`.
- `Game Rules (Sat)` / `(Sun)`: game length and gap. Sat is 24+6 min, so slots are 30 min. Sun is 28+7 min, so slots are 35 min. Points cap 13.
- Hard-cap text: show it on the Info page.

**Schedule.** Pitch × time grid per day, plus the date per row (`31/10/2026`, `01/11/2026`). Used only to map Day → date and to cross-check Gamelist.

**SOTG submissions.** `Your team | Spirit Submitted | Spirit Received | Games Played`.

### 2.4 Tournament format (this event)

- 16 teams. Saturday: 4 pools of 4 (A–D), round robin.
- Then power pools: top 8 → E/F, bottom 8 → G/H. Each power pool keeps one result carried over from A–D.
- Sunday: 5–12 crossovers (`8v9`, `7v10`, `6v11`, `5v12`), then a 1–8 bracket and a 9–16 bracket with full placement games.
- `[4v5]` is a game-to-go for the last Div 1 qualification spot.
- Qualification: places 1–4 go to Div 1 (Q). Places 5–7 go to Div 2 (q).

---

## 3. Slot resolution rules (the "engine")

The sheet already resolves team names as results come in. **Wherever the sheet has a
resolved name or score, the site displays it.** The engine re-implements the same rules
for two reasons:
- to fill in names the sheet hasn't resolved yet, as "possible" teams;
- to drive what-if scenarios.

The rules below were inferred from this sheet. Check them against the sheet's resolved names
at runtime and log any mismatch on the debug page.

### R1. Pool slots
A pool slot (`A1`…`D4`) is held by the team with the matching seed (Seeding tab).

### R2. Pool finish → seed
The team finishing *k*-th in a pool takes the *k*-th best seed originally in that pool.
- Example: pool A holds seeds {1, 7, 11, 13}, so 1A → seed 1, 2A → 7, 3A → 11, 4A → 13. This matches the Pool Results right-hand table.
- The same rule applies to power pools E–H feeding Sunday. Pool E holds seeds {1, 3, 5, 7}, so 1E → 1, 2E → 3, and so on. This matches the Brackets arrows.

### R3. Power-pool slots
`E1`…`H4` are held by whichever team holds the mapped seed after A–D (Seeding tab: `E1 = 1`, `E2 = 3`, …).

### R4. Placement games
A Sunday game `XvY` with X < Y: **the winner takes position X and the loser takes position Y.**
- The team holding position N before a game is decided by the most recent earlier game involving N.
- If no earlier game involves N, N is held by its initial seed (from R2).
- `[4v5]` follows the same rule.

### R5. Final standings
Final place N = the team holding position N after its last game.

### Deriving the bracket graph from R4 (no hard-coded bracket shape)

```
for each placement game g, in row order:
  for p in [g.lo, g.hi]:
    prev = latest earlier placement game where p ∈ {prev.lo, prev.hi}
    g.source[p] = prev ? { game: prev, take: p == prev.lo ? "W" : "L" } : { seed: p }
```

Worked examples:
- `1v4`: position 1 comes from W(`1v8`), position 4 from W(`4v5`).
- `5v8`: position 5 comes from L(`4v5`), position 8 from L(`1v8`).
- `9v16`: position 9 comes from L(`8v9`), position 16 from seed 16 (= 4H).
- `[4v5]`: position 4 comes from L(`3v4`), position 5 from W(`5v6`).

### Pool standings (needed for Saturday what-ifs only)
- Real standings: always use the sheet's W/L/D/Pts/Rank.
- Hypothetical standings: compute points from W/L/D (values per Open Question 2), including carried results.
- When a tie needs UKU tiebreakers (§6 of the UKU Tournament Rules: head-to-head, then points difference among the tied teams, and so on), implement the tiebreakers.
- If hypothetical results without scores leave a tie unresolved, show the order as **"tied — depends on scores"** and let the user drag to choose the order.

---

## 4. Data model (TypeScript)

```ts
type Day = "Saturday" | "Sunday";
type Stage = "pool" | "powerPool" | "placement";

interface Game {
  code: string;            // "A1vA3", "8v9", "[4v5]"
  ordinal: number;         // Gamelist row index
  day: Day;
  start: Date;             // Europe/London; date from Schedule tab, time from Gamelist
  end: Date;               // start + day game length
  slotEnd: Date;           // start + game length + gap
  pitch: number;
  stage: Stage;
  pool?: string;           // "A".."H"
  lo: string; hi: string;  // slot codes: "A1"/"A3" or "8"/"9"
  teamLo?: string; teamHi?: string;   // as resolved by the sheet
  scoreLo?: number; scoreHi?: number;
  isGameToGo: boolean;
}

interface Tournament {
  name: string; isDraft: boolean;
  announcements: string[];
  rules: { day: Day; gameMins: number; gapMins: number; cap?: number }[];
  qualification: { div1: number; div2: number };
  teams: { name: string; seed: number; club: string }[]; // club = name without trailing number
  pools: Pool[];           // from Pool Results (authoritative W/L/D/Pts/Rank)
  games: Game[];
  finalStandings: { rank: number; team?: string }[];
  sotg: { team: string; submitted: number; received: number; played: number }[];
  sotgFormUrl?: string;
  fetchedAt: Date;
}
```

Game status is derived from the clock (Europe/London) plus scores:

| Status | Rule |
|---|---|
| `upcoming` | now < start |
| `live` | start ≤ now < end, no score yet |
| `finishing` | end ≤ now, no score yet. The game is probably finishing its possession or awaiting the result. Treat it as "on" until a score appears or the next slot on that pitch starts. |
| `final` | both scores present |

A debug override `?now=2026-10-31T10:05` fakes the clock so the views can be tested.

---

## 5. Data sync

- Poll **every 60 s while the page is visible**. Pause when it's hidden. Refetch straight away on `visibilitychange`, on focus, and on manual pull-to-refresh.
- Fetch only the tabs due for refresh (§2.2). A full poll is about 15 KB.
- Hash each tab's CSV. Re-parse only when the hash changes.
- When a game's score or teams change, briefly highlight the affected cards ("just updated").
- On errors, retry with exponential backoff (60 s → 2 → 4 → 8 min, capped). Keep showing the last good data with a "couldn't refresh" chip.
- Persist the last good raw CSVs in IndexedDB. On load, render from cache immediately, then refresh.
- Always show **"Updated Xm ago"** in the header. Grey it out after 10 minutes without a successful refresh.
- A parse failure on one tab must not break the others. Keep the previous parse of that tab and log a warning.

---

## 6. Screens and features

Routing is hash-based, so a static host needs no rewrites. A bottom tab bar on mobile and a
top nav on desktop give access to: **Now · Schedule · Teams · Pools · Brackets · Info**.

### 6.1 Now (home)
- **My team card** (if one is set): next game, with a countdown, pitch, opponent (or "W of 4v5: Nottingham 1 / York 1" when unresolved), and the last result.
- **On now:** one card per pitch.
  - Shows teams, score if entered, and a time-remaining bar.
  - When the game is in `finishing` state, the card shows "finishing — awaiting result".
- **Up next:** the next time slot's games per pitch, with a countdown to start.
- **Just finished:** the last slot's results.
- **Announcements banner:** shown when the Header has any announcements.
- **Draft banner:** shown while `DRAFT` is present.
- Between days or after the end, show a "Tournament starts Saturday 09:30" or "Final standings" state.

### 6.2 Schedule
- Day toggle (Sat / Sun). Defaults to today.
- Slot-by-slot list. Each slot is a row of pitch cards; on mobile they stack.
- Auto-scrolls to the current slot.
- Alternative **grid view** (pitch columns × time rows), mirroring the sheet's Schedule tab for people used to it.
- Filters: pitch, stage (pool / power pool / placement), team.
- Unresolved teams show as their slot description in muted text (e.g. "1E", "W 8v9"). Add possible names when the engine can narrow them down.

### 6.3 Search
- Global search box, opened with `/` on desktop or the search icon on mobile.
- Matches:
  - team names (fuzzy: "lboro 2" finds Loughborough 2; "shef" finds all Sheffield teams);
  - game codes (`1v8`, `A2vA3`);
  - `pitch 2`;
  - times (`14:10`).
- Results are grouped: Teams → Games. Selecting a team opens the Team view; selecting a game opens Game detail.

### 6.4 Team view
- Header: team name, club colour, seed, current pool and position, and the "set as my team" star (stored in localStorage).
- **Timeline:** all of the team's games in order. Each shows the result (W/L/D, score), or for upcoming games the time, pitch and opponent.
- **Paths ahead (projections):** a small decision tree from the team's next unresolved game.

  ```
  10:40 P1  vs W(8v9) — Loughborough 3 or Loughborough 4
    ├─ Win  → 12:25 P1 1v4 vs W(4v5): Nottingham 1 / York 1
    │          ├─ Win  → 14:45 P2 Final
    │          └─ Lose → 14:10 P1 3rd place
    └─ Lose → 12:25 P3 5v8 vs L(4v5): Nottingham 1 / York 1
               ├─ Win  → 14:10 P2 5v6 …
               └─ Lose → 14:45 P1 7v8 …
  ```

  - Opponents list every team that could still be in that position, given current results.
  - Show the tree to depth 3. Deeper levels expand on tap.
  - Show the qualification consequence at the leaves (e.g. "Div 1 qualified", "game-to-go").
- **Saturday:** paths cover remaining pool games → which power pool (E/F or G/H) and seed. Example: "Win vs Leeds 3 → finish 1st or 2nd in A → Pool E". This uses the pool what-if logic.
- **Spirit status:** "Spirit submitted 2 of 3 games" with a link to the SOTG form.

### 6.5 What-if mode
- Available from the Team, Pools and Brackets views via "Explore what-ifs".
- In placement games, tap a team to mark it the hypothetical winner.
- In pool games, set W/L/D.
- Everything downstream re-resolves under R1–R5: projected names, team paths, standings.
- Hypothetical results are visually distinct (dashed outline, "if" badge). A sticky banner reads "Viewing a hypothetical scenario — Reset".
- Real results always win. Once a real score arrives, the hypothetical pick for that game is dropped.
- The scenario is kept in the URL hash, so it can be shared ("look who we play if we beat Leeds").

### 6.6 Pools
- One card per pool (A–H): table with team, W, L, D, Pts, Rank (from the sheet), plus the pool's games and results.
- A–D cards show where each finishing position goes (e.g. "1st → E1, 2nd → E4").
- E–H cards show carried results, marked "carried", and Sunday seeds.
- Highlight "my team".

### 6.7 Brackets
- Two bracket boards: **1–8** (including the 5–12 crossovers) and **9–16**. Each has its placement games.
- The bracket shape comes from the graph in §3 (no hard-coded layout), so other tournaments work too.
- Each round is a column. Each column holds game cards, ordered so that connectors between rounds don't cross.
- Game card contents: time, pitch, both teams (resolved name, or slot label plus possible names), scores, winner in bold, status dot (live / final).
- Placement labels sit at the right edge: 1st…16th, with Q / q / GTG badges from the Header's qualification counts.
- **Desktop:** the full tree with SVG connectors drawn between card anchors.
- **Mobile:**
  - Rounds scroll horizontally with scroll-snap, about 1.2 columns visible so the next round peeks in.
  - Connectors stay visible.
  - A round header bar ("Crossover · QF · SF · Final") lets the user jump between rounds.
  - Pinch-zoom is **not** required.
- **Team highlight:** selecting a team (or using "my team") highlights its actual path plus its possible paths, and dims the rest.
- Live games pulse subtly. Recently changed cards flash once.

### 6.8 Game detail (sheet / modal)
- Shows time, pitch, teams, score, status, stage and bracket context: "Winner → 1v4 at 12:25 P1; Loser → 5v8 at 12:25 P3".
- Lists head-to-head earlier in the tournament, if any.

### 6.9 Info
- Tournament name, rules (game length, caps, timeouts, gender rule), hard-cap rules, late/no-show policy, tiebreak note, SOTG form link and SOTG submission table.
- Link to the original Google Sheet.
- "Data freshness" explainer: the sheet is the source of truth, and updates can take a few minutes.

### 6.10 Final standings
- Shown on Now and Brackets once the Sunday games finish: places 1–16 with Q/q badges.

---

## 7. PWA

- Web app manifest:
  - name "Tournament Viewer", short name "Ultimate";
  - `display: standalone`;
  - theme colour;
  - icons at 192/512 px plus a maskable icon;
  - `start_url: "./#/now"`.
- Service worker (Workbox via `vite-plugin-pwa`):
  - precache the app shell;
  - **network-only for Google CSVs** (the app handles caching in IndexedDB, §5);
  - stale-while-revalidate for fonts and icons.
- Update flow: when a new build is available, show an "Update available — reload" toast. Never reload silently mid-use.
- Installs cleanly on Android Chrome. On iOS Safari, show a one-time hint ("Share → Add to Home Screen"), dismissible.
- Offline: the app opens and shows the last data with an "Offline — showing data from 10:42" chip.

---

## 8. Design and UX

- **Mobile-first.**
  - Target 360 px width.
  - Thumb-reachable bottom navigation.
  - Tap targets ≥ 44 px.
  - The Now page needs no horizontal scroll.
- **Readable at a glance in a sports hall:**
  - large time and pitch numbers;
  - high-contrast light theme by default, plus a dark theme (follows the system, with a toggle).
- **Club colours:** derive a stable hue per club (`Loughborough 1` → club `Loughborough`). Use it as a small colour chip on team names so teams are easy to spot across views.
- **Layout:** cards with clear hierarchy. Time and pitch first, teams second, score on the right.
- **Motion:** minimal and meaningful (live pulse, update flash). Respect `prefers-reduced-motion`.
- **Accessibility:**
  - semantic HTML;
  - brackets readable by screen readers as nested lists ("Quarter-final: Loughborough 1 vs W 8v9, Pitch 1, 10:40");
  - colour is never the only signal.
- **Performance:**
  - < 150 KB JS gzipped;
  - first render from cache in < 1 s on mid-range phones;
  - parsing and engine work stays trivial at 16 teams × ~70 games.

---

## 9. Architecture and tech

- **Static SPA:** Vite + React + TypeScript, Tailwind CSS, PapaParse (CSV), `vite-plugin-pwa`. Dates use `Intl` with `Europe/London`. No date library unless it's needed.
- **No backend.** The browser fetches the Google CSVs directly (CORS allowed).
- **Hosting:** GitHub Pages or Cloudflare Pages (HTTPS, required for the PWA). Deploy from `main` via a GitHub Action.

Source layout:

```
src/
  config/tournaments/yemu-indoor-regionals-2026.json   # publishId, gids, timezone, dates
  data/fetch.ts        # polling, cache-busting, hashing, IndexedDB persistence
  data/parse/*.ts      # one parser per tab → typed model
  engine/              # R1–R5 resolution, bracket graph, pool standings, what-if
  views/               # Now, Schedule, Team, Pools, Brackets, Info, GameDetail
  components/          # GameCard, BracketBoard, PoolTable, SearchPalette, ...
scripts/discover-tabs.ts   # pubhtml → tab name/gid config
test/fixtures/             # captured CSVs (pre-tournament, mid-pools, mid-Sunday, final)
```

- **Multi-tournament ready.** A tournament is just a config file. The default route loads the "current" one. `#/t/<slug>/…` selects another. Tab names follow the UKU template, so `discover-tabs` should work for future events unchanged.

---

## 10. Testing

- **Parsers:** unit tests against captured CSV fixtures. Capture the current (empty-score) state now. Add mid-tournament snapshots as they happen, and hand-edit fixtures to simulate results.
- **Engine:**
  - Test R1–R5 with hand-built results.
  - Assert the derived bracket graph matches the worked examples in §3.
  - Assert projected names match the sheet's resolved names whenever the sheet has them.
- **Status logic:** test with the faked clock (`?now=`).
- **Visual checks:** Brackets and Now at 360 px, 768 px and 1280 px.
- **Debug page** (`#/debug`): raw tab hashes, last fetch times, parse warnings, engine-vs-sheet mismatches.

---

## 11. Milestones

The tournament starts **Saturday 31 Oct 2026, 09:30**, so priorities are ordered by when each feature is needed.

| # | Needed by | Scope |
|---|---|---|
| M1 | Sat 09:00 | Config + fetch/poll + Gamelist/Header/Pool Results parsers, **Now**, **Schedule**, **Search**, **Team view (timeline)**, **Pools**, PWA manifest + service worker, deployed |
| M2 | Sat ~14:00 (power pools start 14:30) | Engine R1–R3 + pool standings, Saturday "paths ahead", E–H views with carried results |
| M3 | Sun 09:00 | Engine R4–R5, **Brackets** board (desktop + mobile), Sunday paths-ahead tree, Final standings |
| M4 | Sun / after | What-if mode with shareable URLs, SOTG status, polish, multi-tournament routing |

### Future (post-v1)
- Push notifications ("your next game is on Pitch 2 in 10 min"). These need a small worker (e.g. Cloudflare Worker + cron) to poll the sheet and send Web Push.
- Faster updates: if the TD shares the sheet's real ID with "anyone with the link", the `gviz/tq?tqx=out:csv` endpoint may avoid the publish lag.
- An edge proxy to cache the CSVs once for all clients, if traffic ever matters.
- Calendar export (.ics) for a team's games.

---

## 12. Open questions

1. **Where are scores entered?** The working assumption is Gamelist cols G/I, with Pool Results cols D/F mirroring them. Verify when the first score appears on Saturday morning; the parser should read whichever is populated.
2. **Pool points:** the values for W/D/L (e.g. 2/1/0?) and the exact UKU §6 tiebreak order. Real standings come from the sheet's Pts and Rank, so this only affects what-ifs.
3. **`[4v5]` game-to-go:** is it always played, or only under some condition (the square brackets suggest it's conditional)? For v1, show it as "Game to go (if required)".
4. **Hosting/domain:** GitHub Pages under your account, or a custom domain?
5. **Should the site show spirit scores** if they appear in the sheet, or only submission counts? Default: counts only.
6. **Schedule changes on the day** (pitch swaps, delays) should come through automatically via Gamelist. Does the TD ever post delays only in Announcements? If so, surface Announcements on every page, not just Now.
