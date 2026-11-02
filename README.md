# Ultimate Tournament Viewer

An unofficial, phone-first web app for following ultimate frisbee tournaments that are published as
Google Sheets. Paste the sheet's link to see:

- what's on now and next, and on which pitch
- each team's games
- pool tables with explained tie-breaks
- brackets
- "who could we play next?"
- a what-if mode
- a replay of the tournament through time

It's a static site with no backend. Everything runs in the browser, and data stays on the device.

## Using it

1. Share the tournament sheet as **Anyone with the link → Viewer** (or use its *Publish to web* link).
2. Open the app, press **Add tournament** and paste the link.
3. Pick your team(s). The app orients around followed teams.

Links you can share:

| Parameter | Meaning |
|---|---|
| `?sheet=<id or link>` | Open (and save) a tournament |
| `&m=<…>` | Include a fixed reading of the sheet (mapping, format, corrections) |
| `&if=<…>` | A what-if scenario |
| `&at=2026-10-31T13:00` | Replay the tournament at that time (tournament time zone) |

## How it works

```
src/
  sheets/   links and endpoints, fetching (xlsx, CSV per tab, tab listing), cell parsing, workbook model
  mapping/  mapping types and validation, auto-detection, manual role assignment, share encoding, AI mapper
  extract/  mapping + workbook -> tournament model: days and dates, divisions, stages, pools, quality check
  format/   how teams progress: slot labels, code conventions (R1-R5), validation
  engine/   status, tie-breaks with explanations, standings, possible finishes, "what do we need?",
            slot resolution, bracket boards, scenarios, replay, simulation; buildView() is pure
  store/    IndexedDB cache, settings, refresh scheduler, launch routing
  ui/       screens, shell, components
```

- **Data.** The app loads the whole workbook (xlsx) on open and every 10 minutes. While the page is visible it polls the tabs that hold games and pool tables as CSV every minute. It backs off after failures and re-renders only when content changed.
- **Reading the sheet.** **Auto** detection handles game lists, time × pitch grids, pool tables, seeding, final standings and the UKU template. Where Auto gets it wrong:
  - **Manual mapping:** tap cells in a preview of the sheet.
  - **Improve with AI:** use your own OpenRouter key. The AI only proposes a mapping; you see a before/after comparison and choose whether to use it.
- **Engine.** Rules and tie-breaks follow the tournament's settings: the UKU §6 preset by default, 3/1/0 points, editable. Predictions (possible opponents, brackets, paths) come from a progression *format*, which is checked against the names the sheet fills in later.

## Development

```sh
npm install
npm run dev      # dev server; Home has "Test workbooks" to load the fixtures as if they were sheets
npm test         # unit and golden fixture tests (test/fixtures/sheets)
npm run build    # type-check and production build (PWA)
```

Try replay with a fixture, for example:
`http://localhost:5173/?sheet=fixture:outdoor-1&at=2026-03-21T12:30`.

Deployment: `.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages on
every push to `main`. The site uses a relative base path, so it works from any sub-path.
