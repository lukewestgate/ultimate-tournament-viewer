# Ultimate Tournament Viewer

An unofficial, phone-first viewer for UKU tournament schedules. It reads the TD's published Google Sheet
(CSV per tab, polled every minute) and shows what's on now, schedules, team pages with "paths ahead",
pool tables, brackets and what-if scenarios. It's an installable PWA that works offline from the last data.

- Product spec: [SPEC.md](SPEC.md) · UI brief: [UI_SPEC.md](UI_SPEC.md) · Designs: [ui-design/](ui-design/)

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine + parser tests against test/fixtures
npm run build      # static site in dist/
```

Testing helpers (URL query, before the `#`):

- `?now=2026-10-31T10:12` fakes the clock (London time). It keeps ticking from there.
- `?demo` simulates scores for every game finished by "now", e.g. `?demo&now=2026-11-01T10:52#/brackets`.
- `#/debug` shows fetch times, parse warnings and any mismatches between the engine and the sheet.

## Deploy

It's a static site with no backend; the browser fetches Google's CSVs directly (they allow CORS).

- **GitHub Pages:** push to GitHub and set *Settings → Pages → Source: GitHub Actions*.
  [.github/workflows/deploy.yml](.github/workflows/deploy.yml) tests, builds and deploys on every push to `main`/`master`.
- **Anything else** (Netlify, Cloudflare Pages, Vercel): build command `npm run build`, output `dist`.
  `base` is relative, so any sub-path works.

## Another tournament

1. `npm run discover-tabs -- <publishId>` prints the tab gids for a published sheet.
2. Add an entry to `TOURNAMENTS` in [src/config.ts](src/config.ts). The first entry is the default;
   others are selected with `?t=<slug>`.

The engine works out the bracket shape from the sheet itself, so UKU-template sheets should work without code changes.
The rules: in placement game `XvY`, the winner takes place X and the loser takes place Y; pool finish *k* inherits the
*k*-th best seed in the pool.

## Layout

```
src/config.ts          tournaments, tab gids
src/data/              feed (polling, cache), parsers, demo simulator
src/engine/            resolution (who plays whom), pool ranking, bracket model, paths ahead
src/views/             Now, Schedule, Teams/Team, Pools, Brackets, Info, Search, GameSheet, Debug
src/components/        game cards, badges, icons
```
