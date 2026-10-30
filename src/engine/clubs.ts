const PINNED: Record<string, string> = {
  loughborough: '#7C4DDB',
  leeds: '#1F7AE0',
  sheffield: '#E0452B',
  nottingham: '#12A06A',
  york: '#D39B0B',
};
const SPARE = ['#D63C86', '#0E9CB2', '#9C6B32', '#5560E6', '#7DA51C', '#EE7A12', '#B048C4'];

export const clubOf = (team: string) => team.replace(/\s+\d+$/, '').trim();

const assigned = new Map<string, string>();

export function clubColor(team: string | undefined): string {
  if (!team) return 'transparent';
  const club = clubOf(team).toLowerCase();
  const pinned = Object.entries(PINNED).find(([k]) => club.startsWith(k));
  if (pinned) return pinned[1];
  const hit = assigned.get(club);
  if (hit) return hit;
  let h = 0;
  for (const ch of club) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const used = new Set(assigned.values());
  let i = h % SPARE.length;
  for (let n = 0; n < SPARE.length && used.has(SPARE[i]); n++) i = (i + 1) % SPARE.length;
  assigned.set(club, SPARE[i]);
  return SPARE[i];
}

/** "Loughborough 3" -> "L3", "York 1" -> "Y1" */
export function initials(team: string): string {
  const m = /^(.*?)(\d+)?$/.exec(team.trim());
  const words = (m?.[1] ?? team).trim().split(/\s+/);
  return words.map((w) => w[0]).join('').slice(0, 2).toUpperCase() + (m?.[2] ?? '');
}
