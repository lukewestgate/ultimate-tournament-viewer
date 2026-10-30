# Ultimate Tournament Viewer — UI Design Brief

A brief for designing the look and feel of the app. It describes **what each screen must
show and how it should feel**. It does not cover how it's built; see [SPEC.md](SPEC.md) for that.

---

## 1. What this is

A phone-first web app (installable to the home screen) for players and spectators at UK
ultimate frisbee tournaments. Tournament directors publish the schedule as a messy Google
Sheet. This app shows the same data clearly:
- what's on now and on which pitch;
- what's next;
- each team's games;
- pool tables;
- brackets;
- "who will we play next if we win or lose?"

It's an **unofficial, community** tool. Do not use UK Ultimate (UKU) logos or branding.

### Who uses it, and where

| User | Context | What they need |
|---|---|---|
| **Player** (main user) | In a sports hall or on a field between games. Phone in one hand, sweaty, glancing for a few seconds. Possibly bright light or a dim hall. | "When and where is our next game, and who's it against?" in under 2 seconds. |
| **Captain** | Same, but planning ahead. | "If we win this, who's next? If we lose?" Pool standings. |
| **Spectator / parent / club-mate** | Phone or laptop, possibly remote. | Live scores, brackets, final standings. |
| **Tournament desk** | Laptop on a table. | A big "on now / next" overview across all pitches. |

### Design principles
1. **Glanceable.** Time and pitch are the most important things on screen. Make them big.
2. **"My team" first.** Once a user picks their team, everything orients around it.
3. **Clear about uncertainty.** Many future games have unknown teams (e.g. "Winner of 8v9"). Show possible teams elegantly, without clutter.
4. **Honest about freshness.** Data can be a few minutes behind. Always show "Updated 2m ago" quietly.
5. **Sporty but calm.** Energetic accents, not a casino. Readable over flashy.

---

## 2. Visual direction (open to proposal)

- **Mood:** modern sports app (think scoreboard meets transit departure board). Confident type, generous spacing, rounded cards.
- **Typography:** a strong condensed or grotesk face for times, pitch numbers and scores, using tabular numerals. A neutral sans for body text.
- **Colour:**
  - one primary accent;
  - one "live" colour (e.g. a vivid red or green pulse);
  - neutral greys for unknown or upcoming items;
  - success and muted colours for wins and losses.
- **Club colour chips:** each club (Loughborough, Leeds, Sheffield, Nottingham, York…) gets a distinct generated hue, shown as a small dot or bar beside the team name. Please propose a palette of about 12 hues that work in both themes.
- **Themes:** a light theme (default, high contrast for bright venues) and a dark theme. Design both.
- **Motion:**
  - a subtle pulse on live games;
  - a single brief highlight flash when a score changes;
  - no motion beyond that.

---

## 3. Layout and navigation

**Breakpoints to design:** mobile **390 px** (primary), tablet **768 px**, desktop **1440 px**.

**Navigation:** 6 destinations: **Now · Schedule · Teams · Pools · Brackets · Info**.
- Mobile: bottom tab bar with 5 visible tabs (Info can live in a header menu).
- Desktop: top bar or left rail.
- Global **search** sits in the header on every screen. It opens a full-screen search sheet on mobile and a command palette on desktop.

**Persistent header** (compact), containing:
- tournament name (truncates);
- "Updated 2m ago" freshness chip;
- search icon;
- "my team" avatar or star.

**Global banners** (stackable, dismissible where noted):
- **Draft:** "Draft schedule — may change". Amber. Not dismissible while the sheet is in draft.
- **Announcement:** a text message from the tournament director. Prominent. Dismissible per message.
- **Offline / stale:** "Offline — showing data from 10:42". Grey.
- **What-if:** "Viewing a hypothetical scenario · Reset". Sticky, distinct colour; see §5.6.
- **Update available:** "New version — Reload". Toast.

---

## 4. Components to design

Please produce a component sheet with all the states below.

### 4.1 Game card (most important component)
Used everywhere.
- **Content:** time, pitch, two teams with club chips, two scores, status, game code (small, e.g. `A1vA3` or `1v8`), and a stage label ("Pool A", "Power pool E", "Quarter-final", "5th–8th semi").
- **Variants:** full (Now page), compact row (Schedule / Team lists), bracket node (narrow, see 4.4).
- **States:**

| State | Description |
|---|---|
| Upcoming | Time prominent, no scores, "in 25 min" countdown when soon |
| Live | Live pulse, progress bar of game time elapsed (e.g. 14 of 24 min), scores if entered |
| Finishing | Past the end of game time, no score yet: "Finishing · awaiting result" |
| Final | Scores, winner bold, loser muted. Draws are possible in pools. |
| Unresolved team(s) | Team slot shows a label like "Winner 8v9" with possible names underneath: "Loughborough 3 or Loughborough 4" |
| My team involved | Highlighted border or tint |
| Hypothetical | Dashed outline plus an "if" badge |
| Just updated | One-off flash |

### 4.2 Team label
Club chip plus name. Variants: default, bold (winner), muted (loser), "my team", placeholder (slot label), and possible-teams ("A or B", or "1 of 3 teams" with expand).

### 4.3 Pool table
Columns: Rank, Team, W, L, D, Pts. Rows show "advances to" chips (e.g. "→ Pool E"). Highlight "my team". Mark carried results with a small "carried" tag on the related games.

### 4.4 Bracket node and connectors
- A narrow game card for brackets: two team rows with scores, time and pitch in a small header.
- Connector lines join each node to the next round.
- Placement labels sit at the right edge: "1st", "2nd"…
- Qualification badges: **Q** (Division 1 qualified), **q** (Division 2 qualified), **GTG** (game to go).

### 4.5 Path tree ("who could we play next")
A vertical decision tree. Each branch is labelled **Win** or **Lose** and leads to the next game: time, pitch, possible opponents. Leaves show outcomes ("Final", "3rd place game", "Div 1 qualified"). It must fit in 390 px; nested levels can collapse.

### 4.6 Other components
- Countdown chip ("in 12 min", "Starting now").
- Pitch badge ("P1"), to be very legible.
- Freshness chip.
- Status dot.
- Search result rows (team or game).
- Segmented control (Sat / Sun).
- Filter chips (pitch, stage).
- Empty states.
- Skeleton loading.

---

## 5. Screens

All examples use this tournament's real team names. Scores and results are **made-up sample data**.

### 5.1 Now (home)
The screen most people will see most of the time.

**Order on mobile:**
1. **My team card** (only if a team is set).
   - Big: "Next: 10:30 · Pitch 1 · vs Nottingham 2".
   - Countdown ("in 25 min") and last result ("Lost 7–9 vs Loughborough 1").
   - If no team is set, show a friendly prompt: "Pick your team to see your games first".
2. **On now:** one card per pitch (up to 3), live state. Desktop shows them side by side as a big "departure board".
3. **Up next:** the next time slot, one card per pitch, with a countdown to start.
4. **Just finished:** the last slot's results, compact.

**Sample (Saturday 10:12):**
- On now (10:00–10:24):
  - **P1** Sheffield 1 **5** – 3 Loughborough 4 · Pool C · 12 min left
  - **P2** Nottingham 1 4 – 4 Sheffield 4 · Pool C · 12 min left
- Up next 10:30:
  - **P1** Leeds 1 v Nottingham 2 · Pool B
  - **P2** Loughborough 3 v Sheffield 3 · Pool B
- Just finished 09:30:
  - Loughborough 1 **9**–7 Loughborough 5
  - Sheffield 2 6–6 Leeds 3

**Other states to design:**
- Before the tournament: "Starts Saturday 09:30 · Pitch 1 & 2", plus the first games.
- Between days: "Day 2 starts 09:30 Sunday", with Saturday's final pool standings summary.
- After the end: final standings podium plus the full list.

### 5.2 Schedule
- Sat / Sun segmented control. Filter chips: Pitch 1 / 2 / 3, stage, team.
- **List view (default):** time-slot headers ("10:30", with a "Now" marker on the current slot). Under each, one compact game card per pitch. Auto-scrolls to now.
- **Grid view (toggle):** columns are pitches, rows are times, like the original spreadsheet but beautiful. Good on desktop. On mobile, 3 narrow columns.
- Saturday has 16 slots (09:30–17:00, every 30 min) across 2–3 pitches. Sunday has 12 slots (09:30–15:55, every 35 min). Some slots have empty pitches; show them as quiet gaps.

### 5.3 Search
- Full-screen sheet on mobile. On desktop, a centred palette.
- A recent searches list.
- Results are grouped as **Teams** (club chip, name, next game summary) and then **Games** (compact game card).
- Example queries: "shef" (5 Sheffield teams), "1v8", "pitch 3", "14:10".

### 5.4 Teams (list) → Team detail
**List:** teams grouped by club, with club chips. A star marks "my team".

**Team detail (e.g. Leeds 1):**
- Header: name, club colour band, seed (#2), current standing ("2nd in Pool B"), and a ⭐ "My team" toggle.
- **Next game** hero card.
- **Paths ahead:** the path tree (4.5). Sunday example:

  ```
  10:40 · P1 · Quarter-final vs Winner 8v9 (Loughborough 3 or Loughborough 4)
  ├─ Win → 12:25 · P1 · Semi-final vs Winner 4v5 (Nottingham 1 or York 1)
  │        ├─ Win → 14:45 · P2 · Final            [Q Div 1]
  │        └─ Lose → 14:10 · P1 · 3rd place game   [Q Div 1]
  └─ Lose → 12:25 · P3 · 5th–8th semi vs Loser 4v5 (Nottingham 1 or York 1)
           ├─ Win → 14:10 · P2 · 5th/6th          [q / GTG]
           └─ Lose → 14:45 · P1 · 7th/8th          [q / –]
  ```

  On Saturday the tree is about pool outcomes, e.g. "Win vs Leeds 3 → finish 1st or 2nd in Pool A → Power pool E (top 8)".
- **Games timeline:** every game in order, with W / L / D pills and scores. Upcoming games show time and pitch.
- **Spirit:** "Spirit scores submitted: 2 of 3 games" plus a button to open the spirit form.
- **"Explore what-ifs"** button (§5.6).

### 5.5 Pools
- Cards for Pools **A–D** (Saturday morning) and **E–H** (Saturday afternoon power pools: E/F for the top 8, G/H for the bottom 8).
- Each card: table (4.3) plus a collapsible list of the pool's games.
- Sample Pool A: Loughborough 1, Sheffield 2, Loughborough 5, Leeds 3.
- A–D cards show where each place goes ("1st → E", "2nd → E", "3rd → G", "4th → G").
- Mobile: cards stacked, with a pool switcher (A B C D | E F G H) at the top. Desktop: 2×2 grid.

### 5.6 What-if mode
- Entered from the Team, Pools or Brackets screens.
- The user taps a team in an unplayed game to say "they win". In pools, they choose Win / Draw / Lose.
- Everything downstream updates: bracket names, path trees, pool tables.
- Needs a clearly distinct look so nobody mistakes it for real results:
  - sticky banner;
  - tinted background or pattern;
  - dashed outlines on picked games.
- Banner actions: Reset and Share (copies a link).

### 5.7 Brackets (high visual priority)
Sunday placement brackets. This screen should look great, because people will screenshot it.

**Structure for this tournament:**
- **Board 1: 1st–8th.**
  - **Crossovers** (5th–12th play-in): 8v9 · 7v10 · 6v11 · 5v12
  - **Quarter-finals:** 1v8 · 4v5 · 2v7 · 3v6
  - **Semis:** 1v4 · 2v3
  - **Final** 1v2 and **3rd place** 3v4
  - **5th–8th:** 5v8 · 6v7 → 5v6 · 7v8
  - **Game to go:** [4v5], the loser of 3rd place vs the winner of 5th/6th, for the last Division 1 spot
- **Board 2: 9th–16th.**
  - Quarter-finals 9v16 · 12v13 · 11v14 · 10v15
  - Semis 9v12 · 10v11
  - Placement: 9v10 · 11v12 · 13v16 · 14v15 → 13v14 · 15v16
- Losers drop into placement games, so lower branches are secondary trees fed by "Loser of …" labels.
- Every node shows time and pitch (e.g. "Sun 12:25 · P1").
- Right-edge placement column: 1st–4th get **Q**, 5th–7th get **q**, plus the **GTG** marker.

**Desktop:** the full tree left-to-right, with smooth connector lines and comfortable spacing.

**Mobile (390 px), the hard part:**
- Horizontal swipe between rounds with snapping, about 1.2 columns visible so the next round peeks in.
- A sticky round header ("Crossover · QF · SF · Final"), tappable to jump.
- Connectors stay visible across columns.
- No pinch-zoom required.
- Please explore 1–2 alternatives too, e.g. a vertical "path list" mode.

**Team highlight:** selecting a team (or "my team") lights up its actual path and possible future paths, and dims everything else.

**Unresolved nodes** show slot labels ("1E", "Winner 8v9") with possible teams.

**Live nodes** pulse. **Final nodes** show the winner bold.

**Sample mid-Sunday state:**
- Crossovers final: Loughborough 3 **10**–8 Loughborough 4; York 1 **9**–6 Leeds 2.
- QFs in progress.
- Later rounds unresolved.

### 5.8 Game detail (bottom sheet on mobile, modal on desktop)
- Teams and score at large size, time, pitch, stage and status.
- **"What's at stake":** "Winner → Semi-final 12:25 P1 · Loser → 5th–8th semi 12:25 P3".
- Earlier head-to-head between the two teams this weekend, if any.

### 5.9 Info
- Tournament name and dates.
- Rules in readable sections:
  - game length (Sat 24 min, Sun 28 min, cap 13);
  - timeouts;
  - mixed gender ratio rule (ABBA);
  - draws (allowed in pools, not in knockouts);
  - late / no-show policy;
  - hard-cap rules.
- Spirit of the Game form button and a submission tracker table.
- Link to the original spreadsheet.
- Short "About this app / data freshness" text.
- Theme toggle.

### 5.10 Final standings
- Podium (1st–3rd) plus a list of 4th–16th with Q / q badges.
- Shown on Now after the tournament and as a tab within Brackets.

---

## 6. Global states to show

- **First load:** skeleton cards.
- **No team chosen vs team chosen.**
- **Offline / stale data.**
- **Draft banner plus announcement banner** stacked.
- **What-if mode active.**
- **Error:** "Couldn't reach the schedule — showing last data", with a retry.
- **Install prompt:** Android install button, and an iOS one-time hint "Share → Add to Home Screen".

---

## 7. Accessibility

- Text contrast ≥ 4.5:1 in both themes. Times, pitches and scores should be larger and higher contrast.
- Tap targets ≥ 44 px.
- Colour is never the only signal: live = pulse + label, win = bold + "W".
- Support dynamic text size up to about 130% without breaking cards.
- Reduced-motion variants: no pulse, just a static "LIVE" label.

---

## 8. Deliverables requested

1. **Style foundations:** colour tokens (light and dark), the club-hue palette, type scale, spacing, radii, elevation, iconography.
2. **Component sheet** covering every state in §4.
3. **Screens at 390 px** for §5.1–5.10, including the key states in §6. Both themes for Now, Brackets and Team detail.
4. **Screens at 1440 px** for Now ("departure board"), Schedule grid, Pools and Brackets.
5. **Bracket exploration:** the mobile swipe approach plus one alternative.
6. **App icon and splash:** a simple disc / pitch motif, with a maskable variant. Not UKU-branded.
