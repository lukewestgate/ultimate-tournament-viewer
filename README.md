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

Home lists your tournaments and any featured ones, with search and On now, Upcoming and Completed filters.

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
tools/      the Apps Script behind the featured sheet
```

- **Data.** The app loads the whole workbook (xlsx) on open and every 10 minutes. While the page is visible it polls the tabs that hold games and pool tables as CSV every minute. It backs off after failures and re-renders only when content changed.
- **Reading the sheet.** **Auto** detection handles game lists, time × pitch grids, pool tables, seeding, final standings and the UKU template. Where Auto gets it wrong:
  - **Manual mapping:** tap cells in a preview of the sheet.
  - **Improve with AI:** use your own OpenRouter key. The AI only proposes a mapping; you see a before/after comparison and choose whether to use it.
- **Engine.** Rules and tie-breaks follow the tournament's settings: the UKU §6 preset by default, 3/1/0 points, editable. Predictions (possible opponents, brackets, paths) come from a progression *format*, which is checked against the names the sheet fills in later.

## Featured tournaments

Featured tournaments appear on everyone's Home, with a reading you've fixed once for everybody. The list is a public Google Sheet, so publishing doesn't need a deploy. The app checks it every 5 minutes while open.

**Setting it up (once):**

1. Create a Google Sheet and share it as **Anyone with the link → Viewer**. Leave the first tab empty.
2. In the sheet, open **Extensions → Apps Script** and replace the code with `tools/featured-sheet.gs`.
3. In the script's **Project Settings**, add a script property called `ADMIN_KEY`, with a long random value.
4. Choose **Deploy → New deployment → Web app**, with **Execute as: Me** and **Who has access: Anyone**. Copy the URL ending `/exec`.
5. Put the sheet's link in `FEATURED_SHEET` in `src/store/featured.ts`, and push.
6. In the app, open **App settings → Admin**, enter the URL and key, and press **Test**.

The key stays in your browser and the script's properties. Never put it in the repo or the sheet, as both are public. To change it, edit `ADMIN_KEY` and enter the new value in the app. If you edit the script, deploy a new version of the web app.

**Publishing:** add the tournament as normal, fix its reading, then press **Publish** in **How this sheet is read**. Later fixes stay on your device until you press **Update**.

**The sheet:** each row is a tournament. You can edit it by hand, for example to correct a title or dates, and clearing **show** hides a row. Publishing again rewrites everything except **show**. Dates are `yyyy-mm-dd`, names are separated by `|`, and the app skips rows it can't use.

**Who gets a fix:** anyone who hasn't changed the reading themselves, even if they've already opened the tournament. Someone with their own reading keeps it, and can switch with **Use the featured reading**.

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
