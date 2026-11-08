# Ultimate Tournament Viewer

Phone-first viewer for ultimate frisbee tournaments published as Google Sheets. React 19 + Vite, no backend.
See README.md for how it works.

## Checks

- `npm run typecheck`, `npm test` (vitest), `npm run build`. Run all three before pushing.
- `npm run dev`, then open `#/gallery` for every shared component in both themes, or add `?sheet=fixture:<name>`
  (names in `test/helpers/fixtures.ts`) to open a test workbook without the network.

## Design system

The visual language is published as the **Ultimate Tournament Viewer Design System**
(https://claude.ai/artifact/4rioFdjGpG5aGuVeqUquwE). Read its README before designing UI. In code:

- Colours, radii and shadows come from `src/ui/styles/tokens.css` (`var(--accent)`, `var(--ink3)`…). Never write a hex
  in a component; the 12 club hues in `src/ui/colors.ts` are the one exception and are only ever dots or bars.
- Text is Inter; times, scores and pitch badges are Barlow Condensed (`.d`). Controls are at least 44px tall.
- Words: "Reading" (how the app reads a sheet), "Fix with AI", "Map it yourself", "History". Sentence case, verbs first,
  no exclamation marks.

## Components

- Shared components live in `src/ui/components/<Name>/` as `<Name>.tsx` + `<Name>.css`, exported from
  `src/ui/components/index.ts`. They take props only (no `useT()` or store), so the gallery and the design system can
  render them on their own.
- Every new shared component gets a section in `src/ui/Gallery.tsx` with realistic sample props.
- Screen-specific styles stay in `src/ui/styles/<area>.css`. When a redesign touches an older shared piece (in
  `src/ui/parts.tsx` or a screen file), move it into `src/ui/components/` then.

## Redesigning a section

1. Audit the current screens, 2. write a brief, 3. prototype on the design system, 4. add new components to the design
   system as proposed, 5. build here, 6. re-sync the design system from the merged code (ask Claude to "re-sync the
   design system"). The Reading redesign (Info → Reading) is the worked example.

## Behaviour rules

- Changes to the reading apply at once with Undo in the toast (`editWithUndo` in `src/ui/mappingEdit.ts`). Big
  changes (AI, mapping, Start over) go through `store.runtime(id).setMapping(…, remember)` so History keeps the reading
  before. Never ask "are you sure" for something that can be undone.
- Game counts shown to people come from `readingCounts` (`src/mapping/issues.ts`): scheduled games, no byes.
- AI only proposes; nothing it returns is used until the person taps Use.
