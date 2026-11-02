import { addDays, clean, datesFromTitle, isBlank, parseDuration, parseScore, parseTime, parseWeekday, weekdayOf, WEEKDAYS, formatTime } from '../sheets/cells';
import { cell, cellKey, findTab, type Tab, type Workbook } from '../sheets/workbook';
import type { Mapping } from '../mapping/types';
import { dayName, poolName } from '../mapping/detect';
import type { DayInfo, Division, Game, InfoSection, LinkItem, Links, Pool, SheetTableRow, Team, Timing, Tournament } from '../model/types';
import { ukuPreset } from '../engine/rulesPresets';
import { zonedEpoch, MIN } from '../engine/time';
import { parseSlotLabel, slotsFromCode, splitSlot } from '../format/labels';
import { readGameSource, readPoolTable, readSeeding, readStandings, type RawGame } from './read';
import { closeSpelling, clubOf, foldName, isByeName, regionTag, tidyName } from './names';
import { gameLengthsFromText, rulesFromText } from './rulesText';
import { rawDiv, splitDivisions } from './divisions';

export interface ExtractOptions {
  id: string;
  title?: string;
  sheetUrl: string;
  now?: number;
}

const DEFAULT_TZ = 'Europe/London';

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Short pitch label: "PITCH 1" -> "1", "Pitch 1a" -> "1a", "Pitch 1 🎥" -> "1". */
export function pitchLabel(raw: string | undefined): string {
  let s = clean(raw).replace(/^(pitch|field|court|p)\s*(no\.?|number)?\s*/i, '');
  s = s.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  return s;
}

function pitchOrder(label: string, fallback: number): number {
  const m = /^(\d+)/.exec(label);
  return m ? Number(m[1]) + (/[a-z]$/i.test(label) ? (label.toLowerCase().charCodeAt(label.length - 1) - 96) / 100 : 0) : 1000 + fallback;
}

/** Text lines of a tab in reading order: each row's non-empty cells joined with " · ". */
export function tabLines(tab: Tab): string[] {
  return tab.rows.map((row) => row.map(clean).filter(Boolean).join(' · '));
}

export function extract(wb: Workbook, mapping: Mapping, opts: ExtractOptions): Tournament {
  const warnings: string[] = [];
  const corr = mapping.corrections;
  const tz = corr.timeZone || DEFAULT_TZ;
  const now = new Date(opts.now ?? Date.now());

  // ---- info text (used by rules, timing, links)
  const infoTabs = mapping.info.map((n) => findTab(wb, n)).filter((t): t is Tab => Boolean(t));
  const infoLines: string[] = [];
  for (const t of infoTabs) infoLines.push(...tabLines(t));
  // Long text from other visible tabs also counts as rules text.
  for (const t of wb.tabs) {
    if (t.hidden || infoTabs.includes(t)) continue;
    for (const row of t.rows) for (const c of row) if (clean(c).length >= 30) infoLines.push(clean(c));
  }

  // ---- seeding
  const seedRows: { seed: number; team: string; label?: string }[] = [];
  for (const s of mapping.seeding) for (const r of readSeeding(wb, s)) seedRows.push({ ...r, label: s.label });

  // ---- raw games
  const raws: RawGame[] = [];
  mapping.games.forEach((src, i) => {
    try {
      raws.push(...readGameSource(wb, src, i));
    } catch (e) {
      warnings.push(`Couldn't read games from ${src.tab}: ${(e as Error).message}`);
    }
  });

  // ---- names: aliases, folding, seeding spellings win
  const aliasMap = new Map<string, string>();
  for (const [from, to] of Object.entries(corr.aliases)) aliasMap.set(foldName(from.replace(/^.*::/, '')), tidyName(to));
  const spelling = new Map<string, Map<string, number>>();
  const addSpelling = (raw: string, weight: number) => {
    const t = tidyName(raw);
    const k = foldName(t);
    if (!k) return;
    const m = spelling.get(k) ?? new Map<string, number>();
    m.set(t, (m.get(t) ?? 0) + weight);
    spelling.set(k, m);
  };
  for (const s of seedRows) addSpelling(s.team, 1000);
  const isPlaceholderTeam = (s: string | undefined, slot: string | undefined) => {
    if (!s || isBlank(s)) return true;
    const lbl = parseSlotLabel(s, true);
    if (lbl && lbl.kind !== 'unknown') return true;
    if (lbl?.kind === 'unknown') return true;
    if (slot && splitSlot(slot) && foldName(s) === foldName(slot)) return true;
    return false;
  };
  for (const g of raws) {
    if (!isPlaceholderTeam(g.team1, g.slot1)) addSpelling(g.team1!, 1);
    if (!isPlaceholderTeam(g.team2, g.slot2)) addSpelling(g.team2!, 1);
  }
  const canonical = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const k = foldName(raw);
    const alias = aliasMap.get(k);
    if (alias) return alias;
    const m = spelling.get(k);
    if (!m) return tidyName(raw);
    let best = '';
    let bestN = -1;
    for (const [s, n] of m) if (n > bestN || (n === bestN && s.length > best.length)) [best, bestN] = [s, n];
    return best;
  };

  // BYE is not a team, unless a team literally called "Bye" has results.
  const byeHasScores = raws.some((g) => (isByeName(g.team1) || isByeName(g.team2)) && parseScore(g.score1)?.n !== undefined && parseScore(g.score2)?.n !== undefined);
  const isBye = (s: string | undefined) => !byeHasScores && isByeName(s);

  // ---- days and dates
  const dayOrder: string[] = [];
  const dayDates = new Map<string, string>();
  const lastDayFallback = () => dayOrder[dayOrder.length - 1];
  const rawDay = (g: RawGame) => (g.dayRaw ? dayName(g.dayRaw) : undefined);
  for (const g of raws) {
    const d = rawDay(g);
    if (!d) continue;
    if (!dayOrder.includes(d)) dayOrder.push(d);
    if (g.date && !dayDates.has(d)) dayDates.set(d, g.date);
  }
  if (!dayOrder.length) dayOrder.push(raws.length ? 'Day 1' : 'Day 1');
  // Order days by date where known, else as they appear; weekday names follow the week.
  const titleDates = datesFromTitle(opts.title ?? corr.title ?? wb.title ?? ukuTitle(wb), now);
  const scheduleDates = ukuScheduleDates(wb);

  // ---- unscheduled placeholders: games with no pitch where most games have one.
  const withPitch = raws.filter((g) => clean(g.pitchRaw)).length;
  const pitchExpected = withPitch > raws.length * 0.6;

  const usedDays = dayOrder.filter((d) => raws.some((g) => (rawDay(g) ?? dayOrder[0]) === d && (!pitchExpected || clean(g.pitchRaw))));
  const days: DayInfo[] = [];
  const allDays = usedDays.length ? usedDays : dayOrder;
  allDays.forEach((d, i) => {
    let date = corr.dates[d];
    let src: DayInfo['dateSource'] = 'user';
    if (!date) {
      date = dayDates.get(d) ?? scheduleDates[d];
      src = 'sheet';
    }
    if (!date && titleDates.length) {
      const wd = parseWeekday(d);
      date = (wd && titleDates.find((t) => weekdayOf(t) === wd)) || titleDates[Math.min(i, titleDates.length - 1)];
      src = 'sheet';
    }
    if (!date && i > 0 && days[i - 1]) {
      const prev = days[i - 1];
      const wd = parseWeekday(d);
      let gap = 1;
      if (wd) {
        const a = WEEKDAYS.indexOf(weekdayOf(prev.date).toLowerCase());
        const b = WEEKDAYS.indexOf(wd.toLowerCase());
        gap = ((b - a + 7) % 7) || 7;
      }
      date = addDays(prev.date, gap);
      src = prev.dateSource === 'guessed' ? 'guessed' : prev.dateSource;
    }
    if (!date) {
      date = guessFirstDate(d, now);
      src = 'guessed';
    }
    days.push({ name: d, date, dateSource: src });
  });
  days.sort((a, b) => a.date.localeCompare(b.date));
  const dayIndex = new Map(days.map((d, i) => [d.name, i]));

  // ---- timing
  const lengths = gameLengthsFromText(infoLines);
  const sched = ukuScheduleTiming(wb);
  const capMins = sched.cap ?? capFromText(infoLines);

  // ---- build games
  const games: Game[] = [];
  const seen = new Set<string>();
  const sourceKeys = new Map<string, number>();
  for (const g of raws) {
    const day = rawDay(g) ?? (mapping.games[g.source] && 'fixedDay' in mapping.games[g.source] ? mapping.games[g.source].fixedDay : undefined) ?? lastDayFallback() ?? days[0]?.name;
    const pitchRaw = clean(g.pitchRaw);
    const label = pitchLabel(pitchRaw);
    const unscheduled = (pitchExpected && !pitchRaw) || !dayIndex.has(day);
    const mins = g.timeMins ?? 0;
    const key = `${day}|${mins}|${label || g.ref}`;
    if (seen.has(key)) {
      const firstSource = sourceKeys.get(key);
      if (firstSource !== undefined && firstSource !== g.source) continue; // earlier source wins
    }
    let id = `${dayIndex.get(day) ?? 9}-${formatTime(mins).replace(':', '')}-${(label || 'x').replace(/\s+/g, '')}`;
    let n = 2;
    while (games.some((x) => x.id === id)) id = `${id.replace(/~\d+$/, '')}~${n++}`;
    seen.add(key);
    sourceKeys.set(key, g.source);

    const code = clean(g.code) || undefined;
    const fromCode = slotsFromCode(code);
    let slot1 = clean(g.slot1) || undefined;
    let slot2 = clean(g.slot2) || undefined;
    if (isBlank(slot1)) slot1 = undefined;
    if (isBlank(slot2)) slot2 = undefined;
    if (!slot1 && !slot2 && fromCode) [slot1, slot2] = fromCode.slots;
    const t1Raw = g.team1;
    const t2Raw = g.team2;
    const ph1 = isPlaceholderTeam(t1Raw, slot1);
    const ph2 = isPlaceholderTeam(t2Raw, slot2);
    const team1 = ph1 || isBye(t1Raw) ? undefined : canonical(t1Raw);
    const team2 = ph2 || isBye(t2Raw) ? undefined : canonical(t2Raw);
    const s1 = parseScore(g.score1);
    const s2 = parseScore(g.score2);
    const marks: Game['marks'] = s1?.mark || s2?.mark ? [s1?.mark, s2?.mark] : undefined;
    const isGameToGo = Boolean(fromCode?.gameToGo) || /game to go|if required/i.test(code ?? '');
    const date = days[dayIndex.get(day) ?? 0]?.date ?? days[0].date;
    const dayKey = dayIndex.has(day) ? day : days[0].name;
    games.push({
      id,
      ref: g.ref,
      day: dayKey,
      time: formatTime(mins),
      start: zonedEpoch(date, mins, tz),
      end: 0,
      slotEnd: 0,
      pitch: { label, order: pitchOrder(label, g.blockIndex ?? 0) },
      stage: 'placement',
      code,
      slots: [slot1, slot2],
      teams: [team1, team2],
      scores: [s1?.n, s2?.n],
      marks,
      forfeit: s1?.forfeit || s2?.forfeit ? [Boolean(s1?.forfeit), Boolean(s2?.forfeit)] : undefined,
      isGameToGo,
      conditional: isGameToGo || undefined,
      labels: ph1 || ph2 ? [ph1 && t1Raw && !isBlank(t1Raw) ? clean(t1Raw) : undefined, ph2 && t2Raw && !isBlank(t2Raw) ? clean(t2Raw) : undefined] : undefined,
      isBye: isBye(t1Raw) || isBye(t2Raw) || undefined,
      unscheduled: unscheduled || undefined,
      bracketHint: g.bracket,
      // carry raw division for the division pass
      division: g.divisionRaw,
    });
  }

  // ---- slot lengths per day (median gap between starts on a pitch)
  const timing: Timing[] = [];
  for (const d of days) {
    const gaps: number[] = [];
    const byPitch = new Map<string, number[]>();
    for (const g of games) if (g.day === d.name && !g.unscheduled) {
      const arr = byPitch.get(g.pitch.label) ?? [];
      arr.push(g.start);
      byPitch.set(g.pitch.label, arr);
    }
    for (const arr of byPitch.values()) {
      const s = [...new Set(arr)].sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) gaps.push((s[i] - s[i - 1]) / MIN);
    }
    const slotMins = Math.max(10, Math.min(180, median(gaps.filter((x) => x > 0)) ?? 30));
    const wd = d.name.slice(0, 3).toLowerCase();
    let gameMins = corr.gameLength[d.name] ?? sched.byDay[wd] ?? lengths.byDay[wd] ?? lengths.all ?? sched.all;
    if (!gameMins || gameMins > slotMins) gameMins = slotMins;
    timing.push({ day: d.name, gameMins, slotMins, delayMins: corr.delays[d.name] ?? 0, capMins });
  }
  const timingFor = (day: string) => timing.find((t) => t.day === day) ?? { day, gameMins: 25, slotMins: 30, delayMins: 0 };

  // ---- pools (tables)
  const gameTeams = new Map<string, string>();
  for (const g of games) for (const t of g.teams) if (t) gameTeams.set(foldName(t), t);
  /** Pool-table names map to game teams; near-misses ("Sheff Special" ~ "Sheffs Special") match when unique. Nicknames don't. */
  const tableTeam = (raw: string | undefined): string | undefined => {
    if (!raw || isBlank(raw) || isBye(raw)) return undefined;
    const c = canonical(raw)!;
    if (gameTeams.has(foldName(c)) || aliasMap.has(foldName(raw))) return c;
    const near = [...gameTeams.values()].filter((t) => closeSpelling(t, c));
    return near.length === 1 ? near[0] : undefined;
  };
  const pools: Pool[] = [];
  /** Pool slots held by BYE ("pool|slot"): games against them are byes. */
  const byeSlots = new Set<string>();
  const byeSeeds = new Set(seedRows.filter((s) => isBye(s.team)).map((s) => s.seed));
  for (const pm of mapping.pools) {
    const rows = readPoolTable(wb, pm);
    const name = poolName(pm.name);
    if (pools.some((p) => p.name === name)) continue;
    const slots = rows.map((r, i) => ({ slot: r.slot ?? `${name}${i + 1}`, seed: r.seed, team: tableTeam(r.team) }));
    rows.forEach((r, i) => isBye(r.team) && byeSlots.add(`${name}|${r.slot ?? `${name}${i + 1}`}`));
    const sheetTable: SheetTableRow[] = rows
      .filter((r) => tableTeam(r.team))
      .map((r) => ({ team: tableTeam(r.team)!, p: r.p, w: r.w, d: r.d, l: r.l, pf: r.pf, pa: r.pa, diff: r.diff, pts: r.pts, rank: r.rank, note: r.note, newSeed: r.newSeed }));
    const finishToSeed: Record<number, number> = {};
    rows.forEach((r, i) => r.newSeed !== undefined && (finishToSeed[i + 1] = r.newSeed));
    pools.push({ name, stage: 'pool', slots, sheetTable, finishToSeed: Object.keys(finishToSeed).length ? finishToSeed : undefined });
  }
  const poolByName = new Map(pools.map((p) => [p.name, p]));
  const slotPool = (slot: string | undefined): string | undefined => splitSlot(slot)?.prefix || undefined;
  // Pools implied by slot codes (A1vA3) with no table: only small round-robin-looking sets, not placement positions (Ex16).
  const codeSlots = new Map<string, Set<number>>();
  for (const g of games) {
    const a = splitSlot(g.slots[0]);
    const b = splitSlot(g.slots[1]);
    if (a?.prefix && a.prefix === b?.prefix && g.bracketHint !== true) {
      const s = codeSlots.get(a.prefix) ?? new Set<number>();
      s.add(a.n).add(b.n);
      codeSlots.set(a.prefix, s);
    }
  }
  for (const [prefix, ns] of codeSlots) {
    if (poolByName.has(prefix) || Math.max(...ns) > 8 || ns.size < 2) continue;
    const p: Pool = { name: prefix, stage: 'pool', slots: [] };
    pools.push(p);
    poolByName.set(prefix, p);
  }

  // UKU pool listing (Pool | Seed | Team with a code column): pool -> code, seed -> code.
  const listing = ukuPoolListing(wb);
  const effCode = (g: Game, raw: string | undefined): string | undefined => {
    const a = slotPool(g.slots[0]);
    if (a && a === slotPool(g.slots[1]) && listing.poolCode.has(a)) return listing.poolCode.get(a);
    return rawDiv(raw);
  };
  const codes = games.map((g) => effCode(g, g.division));
  for (const g of games) g.division = undefined;
  const seedRowsC = seedRows
    .filter((s) => !isBye(s.team))
    .map((s) => ({ ...s, team: canonical(s.team)!, code: listing.seedCode.get(s.seed) }));

  // ---- divisions
  const divResult = splitDivisions({
    games,
    codes,
    seedRows: seedRowsC,
    standingsLabels: mapping.standings.map((s) => s.label).filter((l): l is string => Boolean(l)),
    poolTabs: mapping.pools.map((p) => ({ pool: poolName(p.name), tab: p.tab })),
    names: corr.divisionNames,
  });
  const divisions: Division[] = divResult.divisions;
  games.forEach((g, i) => (g.division = divResult.gameDivision(g, codes[i])));
  const divOf = (name: string, code?: string) => divResult.divisionOf(name, code);

  // Pool divisions from their table teams (or listing code).
  for (const p of pools) {
    const code = listing.poolCode.get(p.name);
    const ds = p.slots.filter((s) => s.team).map((s) => divOf(s.team!, code)).filter((d): d is string => Boolean(d));
    p.division = mode(ds);
  }

  // ---- stages
  const poolOfTeam = new Map<string, Set<string>>();
  for (const p of pools) for (const s of p.slots) if (s.team) {
    const k = `${p.division ?? ''}::${s.team}`;
    const set = poolOfTeam.get(k) ?? new Set<string>();
    set.add(p.name);
    poolOfTeam.set(k, set);
  }
  const met = new Set<string>();
  for (const g of games) {
    const [t1, t2] = g.teams;
    const [x, y] = g.slots.map(splitSlot);
    let pool: string | undefined;
    const plainSlots = x && y && !x.prefix && !y.prefix;
    if (g.bracketHint !== true && !plainSlots) {
      const a = slotPool(g.slots[0]);
      if (a && a === slotPool(g.slots[1]) && poolByName.has(a)) {
        const p = poolByName.get(a)!;
        if (!p.division || !g.division || p.division === g.division) pool = a;
      }
      if (!pool && t1 && t2 && !(x && y)) {
        const p1 = poolOfTeam.get(`${g.division ?? ''}::${t1}`);
        const p2 = poolOfTeam.get(`${g.division ?? ''}::${t2}`);
        if (p1 && p2) pool = [...p1].find((n) => p2.has(n));
      }
    }
    if (pool && t1 && t2) {
      // A second meeting of the same pair is a placement game (finals after a round robin).
      const k = `${pool}::${[t1, t2].sort().join('|')}`;
      if (met.has(k)) pool = undefined;
      else met.add(k);
    }
    if (pool) {
      g.stage = 'pool';
      g.pool = pool;
    }
  }
  // Fill pool slots from games.
  for (const p of pools) {
    const slotTeams = new Map<string, string>();
    for (const g of games) if (g.pool === p.name) g.slots.forEach((s, i) => s && g.teams[i] && !slotTeams.has(s) && slotTeams.set(s, g.teams[i]!));
    if (!p.slots.length) {
      const keys = [...new Set(games.filter((g) => g.pool === p.name).flatMap((g) => g.slots.filter((s): s is string => Boolean(s))))];
      keys.sort((a, b) => (splitSlot(a)?.n ?? 0) - (splitSlot(b)?.n ?? 0));
      p.slots = keys.map((k) => ({ slot: k, team: slotTeams.get(k) }));
    } else for (const s of p.slots) if (!s.team && slotTeams.has(s.slot)) s.team = slotTeams.get(s.slot);
    p.division ??= mode(games.filter((g) => g.pool === p.name && g.division).map((g) => g.division!));
  }
  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    if (!games.some((g) => g.pool === p.name) && !p.slots.some((s) => s.team)) pools.splice(i, 1);
  }
  // Power pools: teams that already played in an earlier pool (or, before results, a pool that starts after another ends).
  const poolSpan = new Map<string, { first: number; last: number }>();
  for (const g of games) if (g.pool && !g.unscheduled) {
    const s = poolSpan.get(g.pool) ?? { first: Infinity, last: -Infinity };
    s.first = Math.min(s.first, g.start);
    s.last = Math.max(s.last, g.start);
    poolSpan.set(g.pool, s);
  }
  for (const p of pools) {
    const span = poolSpan.get(p.name);
    if (!span) continue;
    const teamsP = new Set(p.slots.map((s) => s.team).filter(Boolean));
    const earlier = pools.filter((o) => o !== p && o.division === p.division && (poolSpan.get(o.name)?.last ?? Infinity) < span.first);
    const overlap = earlier.some((o) => o.slots.some((s) => s.team && teamsP.has(s.team)));
    const unknownTeams = games.filter((g) => g.pool === p.name).every((g) => !g.teams[0] && !g.teams[1]);
    if (overlap || (unknownTeams && earlier.length > 0)) {
      p.stage = 'powerPool';
      for (const g of games) if (g.pool === p.name) g.stage = 'powerPool';
    }
  }
  for (const p of pools) if (p.stage === 'powerPool') {
    const carried = ukuCarried(wb, p.name);
    if (carried.length) p.carried = carried;
  }
  // Byes: games in a pool against a slot held by BYE (by name in the table, or by a BYE seed).
  for (const p of pools) for (const sl of p.slots) if (sl.seed !== undefined && byeSeeds.has(sl.seed)) byeSlots.add(`${p.name}|${sl.slot}`);
  for (const g of games) if (g.pool && g.slots.some((sl) => sl && byeSlots.has(`${g.pool}|${sl}`))) g.isBye = true;
  // Fill pool slot teams from seeds (R1) for first-stage pools with no names in the table.
  const teamOfSeed = new Map<number, string>();
  for (const s of seedRowsC) if (!teamOfSeed.has(s.seed)) teamOfSeed.set(s.seed, s.team);
  for (const p of pools) if (p.stage === 'pool') for (const s of p.slots) if (!s.team && s.seed !== undefined) s.team = teamOfSeed.get(s.seed);

  // ---- timing on games
  for (const g of games) {
    const t = timingFor(g.day);
    const delay = (corr.delays[`${g.day}|${g.division ?? ''}`] ?? 0) + t.delayMins;
    g.start += delay * MIN;
    g.end = g.start + t.gameMins * MIN;
    g.slotEnd = g.start + t.slotMins * MIN;
    if (capMins) g.capMins = capMins;
  }
  games.sort((a, b) => a.start - b.start || a.pitch.order - b.pitch.order || a.pitch.label.localeCompare(b.pitch.label));

  // ---- teams (per division)
  const seedOf = new Map<string, number>();
  for (const s of seedRowsC) {
    const k = `${divOf(s.team, s.code) ?? ''}::${s.team}`;
    if (!seedOf.has(k)) seedOf.set(k, s.seed);
  }
  const teams: Team[] = divResult.teams
    .filter((t) => !isBye(t.name) && !isBlank(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      club: clubOf(t.name),
      division: t.division,
      aliases: [...(spelling.get(foldName(t.name))?.keys() ?? [])].filter((s) => s !== t.name),
      tag: regionTag(t.name),
      seed: seedOf.get(`${t.division ?? ''}::${t.name}`),
    }));

  // ---- seeding
  const seeding = seedRowsC.map((s) => ({ division: divOf(s.team, s.code), seed: s.seed, team: s.team }));

  // ---- final standings
  const finalStandings: Tournament['finalStandings'] = [];
  for (const sm of mapping.standings) {
    for (const r of readStandings(wb, sm)) {
      const team = r.team && !isBye(r.team) ? canonical(r.team) : undefined;
      finalStandings.push({ place: r.place, team, section: sm.label, division: team ? divOf(team) : undefined });
    }
  }

  // ---- rules
  const rules = mapping.rules ?? rulesFromText(infoLines) ?? ukuPreset();

  // ---- info, links, draft, announcements
  const info = infoSections(infoTabs);
  const links = findLinks(wb, opts.sheetUrl, divisions);
  const isDraft = wb.tabs.some((t) => !t.hidden && t.rows.slice(0, 6).some((r) => r.some((c) => /^draft$/i.test(clean(c)))));
  const announcements = findAnnouncements(wb);
  const spirit = findSpiritTables(wb, canonical, (n) => divOf(n));
  applyTieBreakLog(wb, pools, canonical);

  const title = corr.title || opts.title || wb.title || ukuTitle(wb) || 'Untitled tournament';
  if (days.some((d) => d.dateSource === 'guessed')) warnings.push('Dates were guessed. Confirm them in settings.');

  return {
    id: opts.id,
    title,
    format: { divisions: {} },
    days,
    timeZone: tz,
    divisions,
    teams,
    games,
    pools,
    seeding,
    rules,
    timing,
    info,
    links,
    isDraft,
    announcements,
    finalStandings: finalStandings.length ? finalStandings : undefined,
    warnings,
    spirit: spirit.length ? spirit : undefined,
  };
}

function mode<T>(xs: T[]): T | undefined {
  const m = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const x of xs) {
    const n = (m.get(x) ?? 0) + 1;
    m.set(x, n);
    if (n > bestN) [best, bestN] = [x, n];
  }
  return best;
}

/** First day: its nearest occurrence to today, looking back up to 3 days so a running tournament stays on its weekend. */
export function guessFirstDate(day: string, now: Date): string {
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const wd = parseWeekday(day);
  if (!wd) return today;
  const target = WEEKDAYS.indexOf(wd.toLowerCase());
  for (let back = 0; back <= 3; back++) {
    const d = addDays(today, -back);
    if (weekdayOf(d).toLowerCase() === WEEKDAYS[target]) return d;
  }
  for (let fwd = 1; fwd <= 7; fwd++) {
    const d = addDays(today, fwd);
    if (weekdayOf(d).toLowerCase() === WEEKDAYS[target]) return d;
  }
  return today;
}

function ukuTitle(wb: Workbook): string | undefined {
  const h = findTab(wb, 'Header');
  if (!h) return undefined;
  for (let r = 0; r < 4; r++) {
    const v = clean(cell(h, r, 0));
    if (v.length > 12 && !/draft|spirit/i.test(v)) return v;
  }
  return undefined;
}

/** UKU Schedule tab: "Saturday Start:", "Saturday Length:", "Cap length:". */
function ukuScheduleTiming(wb: Workbook): { byDay: Record<string, number>; all?: number; cap?: number } {
  const out: { byDay: Record<string, number>; all?: number; cap?: number } = { byDay: {} };
  const t = findTab(wb, 'Schedule');
  if (!t) return out;
  for (let r = 0; r < Math.min(12, t.rows.length); r++) {
    const label = clean(cell(t, r, 0)).toLowerCase();
    const val = parseDuration(cell(t, r, 1));
    if (val === undefined) continue;
    const m = /^(sat|sun|mon|fri)[a-z]*\s+length/.exec(label);
    if (m) out.byDay[m[1]] = val;
    else if (/^cap length/.test(label)) out.cap = val;
  }
  return out;
}

function ukuScheduleDates(wb: Workbook): Record<string, string> {
  const out: Record<string, string> = {};
  const t = findTab(wb, 'Schedule');
  if (!t?.dates) return out;
  for (const [k, iso] of Object.entries(t.dates)) {
    const [r, c] = k.split(',').map(Number);
    const wd = weekdayOf(iso);
    if (!out[wd] && parseTime(cell(t, r, c)) === undefined) out[wd] = iso;
  }
  return out;
}

/** UKU "Seeding and Pools" pool listing: Pool | Seed | Team with a division code column before it. */
function ukuPoolListing(wb: Workbook): { poolCode: Map<string, string>; seedCode: Map<number, string> } {
  const poolCode = new Map<string, string>();
  const seedCode = new Map<number, string>();
  const t = findTab(wb, 'Seeding and Pools');
  if (!t) return { poolCode, seedCode };
  for (let r = 0; r < Math.min(8, t.rows.length); r++) {
    const h = (t.rows[r] ?? []).map((c) => clean(c).toLowerCase());
    const pc = h.findIndex((x, i) => x === 'pool' && h[i + 1] === 'seed' && h[i + 2] === 'team');
    if (pc < 1) continue;
    const counts = new Map<string, Map<string, number>>();
    for (let rr = r + 1; rr < t.rows.length; rr++) {
      const code = rawDiv(cell(t, rr, pc - 1));
      const slot = splitSlot(clean(cell(t, rr, pc)));
      const seed = Number(clean(cell(t, rr, pc + 1)));
      if (!code || !slot?.prefix) continue;
      const m = counts.get(slot.prefix) ?? new Map<string, number>();
      m.set(code, (m.get(code) ?? 0) + 1);
      counts.set(slot.prefix, m);
      if (seed && !seedCode.has(seed)) seedCode.set(seed, code);
    }
    for (const [p, m] of counts) poolCode.set(p, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    break;
  }
  return { poolCode, seedCode };
}

function capFromText(lines: string[]): number | undefined {
  for (const l of lines) {
    const m = /cap\s*length\s*(?:·|:)?\s*(\d{1,2}:\d{2})/i.exec(l);
    if (m) return parseDuration(m[1]);
  }
  return undefined;
}

function ukuCarried(wb: Workbook, pool: string): { slotA: string; slotB: string }[] {
  const t = findTab(wb, 'Pool Results');
  if (!t) return [];
  const out: { slotA: string; slotB: string }[] = [];
  for (let r = 0; r < t.rows.length; r++) {
    const row = t.rows[r];
    const hit = row.findIndex((c) => /carried result/i.test(c));
    if (hit < 0) continue;
    const code = row.map(clean).find((c) => slotsFromCode(c));
    const s = slotsFromCode(code);
    if (s && splitSlot(s.slots[0])?.prefix === pool) out.push({ slotA: s.slots[0], slotB: s.slots[1] });
  }
  return out;
}

function infoSections(tabs: Tab[]): InfoSection[] {
  const out: InfoSection[] = [];
  for (const t of tabs) {
    let cur: InfoSection | undefined;
    let blank = true;
    for (const row of t.rows) {
      const cells = row.map(clean).filter(Boolean);
      if (!cells.length) {
        blank = true;
        continue;
      }
      const text = cells.join(' · ');
      if (/^draft$/i.test(text)) continue;
      const looksTitle = text.length <= 40 && cells.length === 1 && !/[.!]$/.test(text) && !/https?:/.test(text);
      if ((blank && looksTitle) || !cur) {
        cur = { title: looksTitle ? text.replace(/:$/, '') : t.name, lines: looksTitle ? [] : [text], tab: t.name };
        out.push(cur);
      } else cur.lines.push(text);
      blank = false;
    }
  }
  return out.filter((s) => s.lines.length || s.title);
}

const URL_RE = /https?:\/\/[^\s"'<>)]+/i;

function findLinks(wb: Workbook, sheetUrl: string, divisions: Division[]): Links {
  const items: LinkItem[] = [];
  const seenUrls = new Set<string>();
  for (const t of wb.tabs) {
    if (t.hidden) continue;
    t.rows.forEach((row, r) =>
      row.forEach((text, c) => {
        const url = t.links?.[cellKey(r, c)] ?? URL_RE.exec(text)?.[0];
        if (!url || seenUrls.has(url + text)) return;
        seenUrls.add(url + text);
        const label = clean(text.replace(URL_RE, '')).replace(/[:\s-]+$/, '') || url;
        items.push({ label, url, division: divisions.find((d) => label.toLowerCase().startsWith(d.name.toLowerCase()))?.name });
      }),
    );
  }
  const isSpirit = (i: LinkItem) => /spirit|sotg/i.test(i.label) || /forms\.gle|docs\.google\.com\/forms/.test(i.url);
  const spirit = items.filter(isSpirit);
  const stream = items.find((i) => /youtube|youtu\.be|twitch|stream/i.test(i.url + i.label));
  const pitchMap = items.find((i) => /pitch map|site map|map/i.test(i.label) || /maps\.google|goo\.gl\/maps|maps\.app/.test(i.url));
  return {
    sheet: sheetUrl,
    spirit: spirit[0]?.url,
    stream: stream?.url,
    pitchMap: pitchMap?.url,
    items: items.filter((i) => !/tie-?breaker rules|uku rules|ukultimate\.com/i.test(i.label) || true).slice(0, 40),
  };
}

function findAnnouncements(wb: Workbook): string[] {
  const h = findTab(wb, 'Header');
  if (!h) return [];
  const out: string[] = [];
  const r0 = h.rows.findIndex((row) => row.some((c) => /^announcements?:?$/i.test(clean(c))));
  if (r0 < 0) return out;
  for (let r = r0 + 1; r < h.rows.length; r++) {
    const text = (h.rows[r] ?? []).map(clean).filter(Boolean).join(' ');
    if (!text) break;
    out.push(text);
  }
  return out;
}

function findSpiritTables(wb: Workbook, canonical: (s: string) => string | undefined, divOf: (n: string) => string | undefined): NonNullable<Tournament['spirit']> {
  const out: NonNullable<Tournament['spirit']> = [];
  for (const t of wb.tabs) {
    if (t.hidden || !/sotg|spirit/i.test(t.name)) continue;
    const hr = t.rows.findIndex((row) => row.some((c) => /^your team$/i.test(clean(c))));
    if (hr < 0) continue;
    const hdr = t.rows[hr].map((c) => clean(c).toLowerCase());
    const ct = hdr.indexOf('your team');
    const cs = hdr.findIndex((h) => /spirit submitted/.test(h));
    const cr = hdr.findIndex((h) => /spirit received/.test(h));
    const cp = hdr.findIndex((h) => /games played/.test(h));
    for (let r = hr + 1; r < t.rows.length; r++) {
      const name = clean(cell(t, r, ct));
      if (!name) break;
      const team = canonical(name)!;
      const n = (c: number) => (c >= 0 ? Number(clean(cell(t, r, c))) || 0 : undefined);
      out.push({ team, submitted: n(cs), received: n(cr), played: n(cp), division: divOf(team) });
    }
  }
  return out;
}

function applyTieBreakLog(wb: Workbook, pools: Pool[], canonical: (s: string) => string | undefined) {
  const t = wb.tabs.find((x) => /tie\s*break\s*log/i.test(x.name));
  if (!t) return;
  let pool: Pool | undefined;
  for (let r = 0; r < t.rows.length; r++) {
    const first = clean(cell(t, r, 0));
    const m = /^pool\s+(\S+)\s+rank\s+\d+/i.exec(first);
    if (m) {
      pool = pools.find((p) => p.name === m[1]);
      continue;
    }
    if (!pool) continue;
    const row = t.rows[r].map(clean);
    const iRank = row.findIndex((c, i) => i >= 5 && /^\d+$/.test(c) && row[i + 1]);
    if (iRank < 0) continue;
    const rank = Number(row[iRank]);
    const team = canonical(row[iRank + 1]);
    if (!team) continue;
    pool.tdOrder = [...(pool.tdOrder ?? []).filter((x) => x.rank !== rank), { rank, team }];
  }
}
