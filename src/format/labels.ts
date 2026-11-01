import { clean } from '../sheets/cells';

export type SlotLabel =
  | { kind: 'game'; take: 'winner' | 'loser'; ref: string }
  | { kind: 'poolFinish'; pool: string; place: number }
  | { kind: 'poolSlot'; slot: string }
  | { kind: 'seed'; seed: number }
  | { kind: 'ranked'; place: number; rank: number }
  | { kind: 'unknown'; label: string };

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };

function ordinal(s: string): number | undefined {
  const m = /^(\d+)(?:st|nd|rd|th)?$/i.exec(s);
  if (m) return Number(m[1]);
  return ORD[s.toLowerCase()];
}

/**
 * Parse placeholder text from an unresolved team cell (spec §6.7 layer 3):
 * "Winner 8v9", "W 8v9", "W QF1", "Loser G12", "L SF2", "1st Pool A", "1A", "A1", "Seed 5", "#5", "Best 3rd", "2nd best runner-up".
 * `strict` rejects bare codes ("1A", "A1") which can be real team names.
 */
export function parseSlotLabel(input: string, strict = false): SlotLabel | undefined {
  const s = clean(input);
  if (!s) return undefined;
  let m = /^(?:(winner|loser)\s*(?:of\s+)?|(w|l)\.?(?:\s+|(?=[\d[])))(?:game\s+|g(?=\d))?\s*(\[?[\p{L}\d]+(?:\s*v\s*[\p{L}\d]+)?\]?)$/iu.exec(s);
  if (m) {
    const word = (m[1] ?? m[2]).toLowerCase();
    const take = word.startsWith('w') ? 'winner' : 'loser';
    const ref = m[3].replace(/\s+/g, '');
    // "W3" alone (a division-prefixed position) isn't a game reference.
    if (m[2] && /^\d+$/.test(ref) && !/\s/.test(s)) return undefined;
    return { kind: 'game', take, ref };
  }
  m = /^(\d+(?:st|nd|rd|th)?|first|second|third|fourth)\s+(?:place\s+)?(?:in\s+)?(?:pool|group)\s+([\p{L}\d]+)$/iu.exec(s);
  if (m) return { kind: 'poolFinish', pool: m[2], place: ordinal(m[1])! };
  m = /^(?:pool|group)\s+([\p{L}\d]+)\s+(\d+)(?:st|nd|rd|th)$/iu.exec(s);
  if (m) return { kind: 'poolFinish', pool: m[1], place: Number(m[2]) };
  m = /^(?:seed|#)\s*(\d+)$/i.exec(s);
  if (m) return { kind: 'seed', seed: Number(m[1]) };
  m = /^(?:(\d+)(?:st|nd|rd|th)\s+)?best\s+(\d+)(?:st|nd|rd|th)(?:[- ]placed?)?(?:\s+team)?$/i.exec(s);
  if (m) return { kind: 'ranked', rank: m[1] ? Number(m[1]) : 1, place: Number(m[2]) };
  m = /^(?:(\d+)(?:st|nd|rd|th)\s+)?best\s+(runner[- ]?up|winner|third)$/i.exec(s);
  if (m) return { kind: 'ranked', rank: m[1] ? Number(m[1]) : 1, place: /runner/i.test(m[2]) ? 2 : /third/i.test(m[2]) ? 3 : 1 };
  if (!strict) {
    m = /^(\d{1,2})([\p{L}]{1,2})$/u.exec(s);
    if (m) return { kind: 'poolFinish', pool: m[2], place: Number(m[1]) };
    m = /^([\p{L}]{1,2})(\d{1,2})$/u.exec(s);
    if (m) return { kind: 'poolSlot', slot: s };
  }
  if (/drawn on the day|tbc|tbd|to be (confirmed|decided)|td decides|decided on the day/i.test(s)) return { kind: 'unknown', label: s };
  return undefined;
}

export interface CodeSlots {
  slots: [string, string];
  gameToGo: boolean;
}

/** Slot codes from a game code: A1vA3 -> A1, A3; 8v9; W3v6 -> W3, 6; [4v5] -> 4, 5 (game to go); α1vα2. */
export function slotsFromCode(code: string | undefined): CodeSlots | undefined {
  const c = clean(code);
  const m = /^(\[)?\s*([\p{L}]{0,3}\d{1,3})\s*v\s*([\p{L}]{0,3}\d{1,3})\s*(\])?$/iu.exec(c);
  if (!m) return undefined;
  return { slots: [m[2], m[3]], gameToGo: Boolean(m[1] && m[4]) };
}

/** Split a slot code into prefix letters and number: "A1" -> {prefix:"A", n:1}; "8" -> {n:8}; "W3" -> {prefix:"W", n:3}. */
export function splitSlot(slot: string | undefined): { prefix: string; n: number } | undefined {
  const m = /^([\p{L}]{0,3})(\d{1,3})$/u.exec(clean(slot));
  if (!m) return undefined;
  return { prefix: m[1], n: Number(m[2]) };
}
