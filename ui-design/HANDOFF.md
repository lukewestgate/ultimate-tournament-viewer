# Ultimate Tournament Viewer — design handoff

These files are the **design reference**. They are not production code.
The `design/*.dc.html` files are written in a design-canvas format: HTML and CSS, plus a small
`renderVals()` script holding the sample data. Read exact values from them, and rebuild the
components in the app's own stack. They won't render on their own, because they rely on the
design tool's runtime (`support.js`).

## Files
| File | What it shows |
|---|---|
| `design/Foundations.dc.html` | Colour tokens (light and dark), club hues, type scale, spacing, radii, elevation, icons |
| `design/Components.dc.html` | Every game-card state, compact rows, team labels, pool table, bracket node and connectors, Q / q / GTG badges, path tree, chips, search rows, empty and skeleton states, banners |
| `design/Main.dc.html` | Now screen, mobile, light and dark |
| `design/Team.dc.html` | Team detail (Leeds 1) with the path tree, light and dark |
| `design/Schedule.dc.html` | Schedule list view, mobile |
| `design/Pools.dc.html` | Pools, mobile |
| `design/Brackets.dc.html` | Brackets, mobile swipe layout, light and dark, with team highlight |
| `design/BracketsList.dc.html` | Brackets alternative: vertical path list |
| `design/DesktopNow.dc.html` | Now as a desktop "departure board" (dark by default) |
| `design/DesktopBrackets.dc.html` | Full desktop bracket tree plus placement column |
| `design/Icon.dc.html` | App icon, maskable icon, small sizes, splash |
| `design/canvas.json` | Canvas layout index (not needed for building) |

## Tokens
Set these as CSS custom properties on a theme class (`.t-light` / `.t-dark`).

| Token | Light | Dark |
|---|---|---|
| bg | #F3F4F1 | #0D1015 |
| surface | #FFFFFF | #161A21 |
| surface-2 | #ECEEEA | #222832 |
| line | #DCDFDB | #2A303B |
| ink | #11151B | #F1F3F6 |
| ink-2 | #3F4752 | #C2C9D3 |
| ink-3 (min. contrast grey) | #5F6774 | #8F98A5 |
| accent (my team, primary) | #1D4ED8 | #7C9BFF |
| accent-soft | #E7EDFD | #1C2648 |
| live | #D92D20 | #FF5B4A |
| win | #137A47 | #4CC98A |
| win-soft | #E2F2E9 | #14301F |
| draft bg / ink | #FFEFC7 / #5C3700 | #3A2A0E / #FFD596 |
| what-if / soft | #6B3CC4 / #F4EFFD | #B596FF / #221B35 |

**Club hues** are the same in both themes and appear only as an 8–12 px dot or a 4–6 px bar.
Loughborough #7C4DDB · Leeds #1F7AE0 · Sheffield #E0452B · Nottingham #12A06A · York #D39B0B ·
#D63C86 · #0E9CB2 · #9C6B32 · #5560E6 · #7DA51C · #EE7A12 · #B048C4.
Pin the named clubs. Hash any other club into the spare slots, and bump to the next hue on a collision.

**Type**
- Fonts: Barlow Condensed (500, 600, 700) for times, pitches and scores, always with `font-variant-numeric: tabular-nums`. Inter (400–700) for everything else.
- Display 68/0.9 · score 32 (desktop 60) · section 20/700 · team 15–17 · body 15/1.4 · label 11 caps, +8% letter-spacing.

**Spacing, radii and elevation**
- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48. Mobile gutter 16.
- Radii: 8 badge · 12 button / bracket node · 16 card · 28 sheet · pill.
- Elevation: card `0 1px 2px rgba(17,21,27,.06), 0 6px 16px rgba(17,21,27,.05)`; sheet `0 12px 40px rgba(17,21,27,.18)`.

## Key rules
- **Pitch badge:** solid ink with surface-coloured text. Height 30 for compact, 46 for hero.
- **Live:** a pulsing dot (1.6 s box-shadow ring) plus the "LIVE" label, plus a game-time progress bar. With `prefers-reduced-motion`, drop the pulse.
- **Score change:** a single 1.4 s accent-tint flash on the score.
- **My team:** accent border plus a 1 px accent ring on cards; accent-soft row background plus a 3 px inset accent edge in lists and tables.
- **Hypothetical:** 1.5 px dashed what-if border, what-if-soft fill, and an "IF" badge.
- **Unresolved slot:** dashed hollow dot, italic slot label ("Winner 8v9"), and possible teams in 12–13 px ink-3 underneath.
- **Final:** the winner is bold with a W pill; the loser uses ink-3. Draws show a D pill on both teams.
- **Badges:** Q is solid win; q is a win outline; GTG uses draft colours.
- **Mobile bracket:** 236 px columns with a 40 px gap. The next round peeks in by about 98 px. Snap per round. A sticky round tab row sits on top. Connectors are 2 px line-colour brackets with a 10 px corner radius; the highlighted path is accent (solid for the actual path, dashed for possible ones). Non-path nodes drop to 0.42 opacity.
- **Desktop bracket columns** (x): crossover 0, QF 280, SF 560, medal 840, placement 1110. Node height is about 100.
- **Tap targets:** at least 44 px. Text contrast at least 4.5:1. Colour is never the only signal.

## Assumptions to confirm or undo
- The tournament name and the announcement text are placeholders.
- Leeds 1 is Sunday **seed 1** (the brief said #2, but its example has Leeds 1 facing the winner of 8v9, which only seed 1 does).
- Pool points are W = 2, D = 1. This is a guess and needs checking against the real rules.
- All scores and Leeds 1's Saturday games are made up, apart from the samples in the brief.
- Sunday crossovers run 09:30–10:05. QF 3v6 is at 11:15 on P1.

## Not designed yet
Search sheet / command palette, game detail sheet, Info, final standings, a full what-if screen,
the schedule grid view, desktop Pools, and the screens for before, between and after the
tournament, offline, error and install-prompt states. Build these from the same components and tokens.
