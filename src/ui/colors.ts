/** Club hues (Foundations): 12 mid-lightness colours that read on both grounds. Only ever a dot or a bar. */
export const HUES = ['#7C4DDB', '#1F7AE0', '#E0452B', '#12A06A', '#D39B0B', '#D63C86', '#0E9CB2', '#9C6B32', '#5560E6', '#7DA51C', '#EE7A12', '#B048C4'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Assign clubs to hues by hashing; collisions bump to the next free hue (until all 12 are used). */
export function clubColors(clubs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  for (const c of [...new Set(clubs)].sort()) {
    let i = hash(c.toLowerCase()) % HUES.length;
    if (used.size < HUES.length) {
      while (used.has(i)) i = (i + 1) % HUES.length;
    }
    used.add(i);
    out.set(c, HUES[i]);
  }
  return out;
}
