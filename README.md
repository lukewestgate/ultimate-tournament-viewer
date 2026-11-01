# Ultimate Tournament Viewer

An unofficial, phone-first web app for following ultimate frisbee tournaments published as
Google Sheets. Paste a sheet link and see what's on now, each team's games, pool tables,
brackets, and a what-if mode. It's a static site: everything runs in the browser and data stays on
the device.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit + golden fixture tests
npm run build    # type-check and production build
```

Test workbooks are in `test/fixtures/sheets/`.
