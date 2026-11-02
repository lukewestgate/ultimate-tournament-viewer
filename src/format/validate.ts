import type { Format, Source, Tournament } from '../model/types';

/** Check a format: references exist, games only take from earlier games (no cycles), each position filled once. */
export function validateFormat(t: Tournament, format: Format): string[] {
  const errs: string[] = [];
  const byId = new Map(t.games.map((g) => [g.id, g]));
  for (const [div, f] of Object.entries(format.divisions)) {
    const taken = new Map<string, string>();
    for (const [key, e] of Object.entries(f.sources)) {
      const s: Source = e.source;
      const [kind, a] = key.split(':');
      const target = kind === 'game' ? byId.get(a) : undefined;
      if (kind === 'game' && !target) errs.push(`${key}: game not found.`);
      if (kind === 'pool' && !t.pools.some((p) => p.name === a)) errs.push(`${key}: pool not found.`);
      if (s.kind === 'gameResult') {
        const from = byId.get(s.game);
        if (!from) errs.push(`${key}: refers to a missing game.`);
        else if (target && from.start >= target.start) errs.push(`${key}: takes from a game that isn't earlier (cycle).`);
        const k = `${s.game}:${s.take}`;
        if (taken.has(k)) errs.push(`${key}: the ${s.take} of ${from?.code ?? s.game} is already used by ${taken.get(k)}.`);
        taken.set(k, key);
      }
      if (s.kind === 'poolFinish') {
        if (!t.pools.some((p) => p.name === s.pool)) errs.push(`${key}: pool ${s.pool} not found.`);
        const k = `${s.pool}#${s.place}@${target?.start ?? 'pool'}`;
        if (taken.has(k)) errs.push(`${key}: ${s.place} in pool ${s.pool} is already used.`);
        taken.set(k, key);
      }
    }
    void div;
  }
  return errs;
}
