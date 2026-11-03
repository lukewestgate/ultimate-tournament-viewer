import { describe, expect, it, vi } from 'vitest';
import { aiSetup, buildMappingPrompt, callModel, improveMapping, lookCells, parseMappingReply, parseRange, sampleWorkbook, stats, type AiProgress } from '../src/mapping/ai';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { emptyMapping } from '../src/mapping/types';
import { loadFixture } from './helpers/fixtures';

/** A scripted fake model: returns the given replies in order. */
function fakeModel(replies: string[]) {
  let i = 0;
  const calls: { body: { messages: { role: string; content: string }[]; reasoning?: { effort: string } } }[] = [];
  const f = vi.fn(async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    const content = replies[Math.min(i++, replies.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 8000, completion_tokens: 600 } }), { status: 200 });
  });
  return { fetcher: f as unknown as typeof fetch, calls };
}

describe('AI mapper', () => {
  const wb = loadFixture('list-round-robin');
  const good = detectMapping(wb).mapping;
  const broken = { ...emptyMapping('auto'), info: good.info };

  it('the prompt is bounded and labelled', () => {
    const t = extract(wb, broken, { id: 'x', sheetUrl: '' });
    const msgs = buildMappingPrompt(wb, 'Pitch Hog', broken, stats(t, broken, wb));
    const size = msgs.reduce((n, m) => n + m.content.length, 0);
    expect(size).toBeLessThan(120000); // ~16k tokens at most
    expect(sampleWorkbook(wb)).toContain('E5: Flyght Club Open');
    expect(sampleWorkbook(wb)).toContain('Hidden tabs (not shown): Options');
    expect(sampleWorkbook(wb, 20)).toMatch(/\(tab is \d+ rows x \d+ columns; only the first 20 rows x \d+ columns are shown\)/);
  });

  it('the prompt shows what the current mapping reads, and junk overrides are dropped', () => {
    const wb2 = loadFixture('outdoor-2');
    const m = detectMapping(wb2).mapping;
    const t = extract(wb2, m, { id: 'x', sheetUrl: '' });
    const msgs = buildMappingPrompt(wb2, 'x', m, stats(t, m, wb2), t);
    const c = msgs[1].content;
    expect(c).toMatch(/What the current mapping reads:\nGames by tab: "Gamelist" 40 \(sheet rows 2–41\)/);
    expect(c).toMatch(/\nDivision "Open" \(code O\): \d+ games, \d+ teams: .*\(seed 1\)/);
    expect(c).toMatch(/Days: "Saturday" 2026-09-19 \(date sheet\), 40 games, 30 min games every 40 min/);
    expect(c).toMatch(/Pool "K" \(Women\) pool: 3 slots: .* \| sheet table: .*6pts/);
    expect(c).toContain('Possibly the same team (add an alias if so): "Gateways" → "Gateways U20" in Women');
    const reply = JSON.stringify({ mapping: { ...m, corrections: { teamDivisions: { a: 'Women', b: 3 }, ignoreRows: ['Gamelist!4', 7] } } });
    const parsed = parseMappingReply(reply, wb2, m);
    expect(parsed.mapping!.corrections.teamDivisions).toEqual({ a: 'Women' });
    expect(parsed.mapping!.corrections.ignoreRows).toEqual(['Gamelist!4']);
  });

  it('keeps engine levels and hand-set rules, and takes valid rules from the AI', () => {
    const base = { ...good, engineLevel: { '': 'basic' as const } };
    const aiRules = { points: { win: 2, draw: 1, loss: 0 }, tiebreaks: ['h2hWins', 'nonsense', 'diff'], drawsAllowed: { pool: false } };
    const parsed = parseMappingReply(JSON.stringify({ mapping: { ...good, rules: aiRules } }), wb, base).mapping!;
    expect(parsed.engineLevel).toEqual({ '': 'basic' });
    expect(parsed.rules).toMatchObject({ points: { win: 2, draw: 1, loss: 0 }, tiebreaks: ['h2hWins', 'diff'], drawsAllowed: { pool: false, placement: false }, source: 'ai' });
    const mine = { points: { win: 3, draw: 1, loss: 0 }, tiebreaks: [], drawsAllowed: { pool: true, placement: false }, source: 'user' as const };
    expect(parseMappingReply(JSON.stringify({ mapping: { ...good, rules: aiRules } }), wb, { ...base, rules: mine }).mapping!.rules).toBe(mine);
    expect(parseMappingReply(JSON.stringify({ mapping: { ...good, rules: { points: 'lots' } } }), wb, base).mapping!.rules).toBe(base.rules);
  });

  it('an invalid reply is sent back once, then a better mapping is offered', async () => {
    const { fetcher, calls } = fakeModel(['not json at all', JSON.stringify({ mapping: good, notes: ['Gamelist and Finals'] })]);
    const p = await improveMapping({ wb, current: broken, id: 'x', title: 'Pitch Hog', call: { key: 'k', fetcher } });
    expect(p.attempts).toBe(2);
    expect(calls[1].body.messages.at(-1)!.content).toMatch(/problems/);
    expect(p.better).toBe(true);
    expect(p.after!.games).toBe(105);
    expect(p.before.games).toBe(0);
    expect(p.mapping!.mode).toBe('ai');
    expect(p.usage.promptTokens).toBe(16000);
    expect(p.usage.cost).toBeGreaterThan(0);
  });

  it('reads the ranges the model asks to see, hidden tabs and formulas too', () => {
    const tab = good.games[0].tab;
    const r = parseRange(wb, `'${tab}'!B3:D10`);
    if (typeof r === 'string') throw new Error(r);
    expect([r.r0, r.r1, r.c0, r.c1]).toEqual([2, 9, 1, 3]);
    const rows = parseRange(wb, `${tab}!5:9`);
    if (typeof rows === 'string') throw new Error(rows);
    expect([rows.r0, rows.r1, rows.c0]).toEqual([4, 8, 0]);
    expect(parseRange(wb, 'Nope!A1')).toMatch(/no tab called "Nope"/);
    expect(lookCells(wb, [`${tab}!E5`])).toContain('E5: Flyght Club Open');
    expect(lookCells(wb, ['Options'])).toMatch(/^## "Options"!A1:\w+\d+ \(hidden tab\)/);
    const f = structuredClone(wb);
    const t = f.tabs.find((x) => x.name === tab)!;
    t.formulas = { ...t.formulas, '4,4': 'Seeding!B2' };
    expect(lookCells(f, [`${tab}!E5`], true)).toContain('E5: Flyght Club Open [=Seeding!B2]');
  });

  it('works in steps: looks at cells, tries a mapping, then answers', async () => {
    const tab = good.games[0].tab;
    const { fetcher, calls } = fakeModel([
      JSON.stringify({ look: [`${tab}!A1:H80`] }),
      JSON.stringify({ try: good }),
      JSON.stringify({ mapping: good, notes: ['Read the whole Gamelist'] }),
    ]);
    const seen: AiProgress[] = [];
    const p = await improveMapping({ wb, current: broken, id: 'x', title: 'x', call: { key: 'k', fetcher }, onProgress: (x) => seen.push(x) });
    expect(p.attempts).toBe(3);
    expect(calls[1].body.messages.at(-1)!.content).toMatch(/^Cells:\n## "[^"]+"!A1:H80/);
    expect(calls[2].body.messages.at(-1)!.content).toMatch(/^That mapping reads: Currently reads: 105 games/);
    expect(calls[2].body.messages.at(-1)!.content).toContain('6 replies left.');
    expect(p.steps).toEqual([`Looked at ${tab}!A1:H80`, expect.stringMatching(/^Tried a mapping: 105 games/), expect.stringMatching(/^Answered: 105 games/)]);
    expect(p.mapping!.notes).toEqual(['Read the whole Gamelist']);
    expect(p.better).toBe(true);
    expect(seen.at(-1)).toMatchObject({ attempt: 3, rounds: 8 });
  });

  it('a step that comes back empty costs that step, not the run', async () => {
    const { fetcher, calls } = fakeModel([JSON.stringify({ try: good }), '', JSON.stringify({ mapping: good })]);
    const p = await improveMapping({ wb, current: broken, id: 'x', title: 'x', call: { key: 'k', fetcher } });
    expect(p.error).toBeUndefined();
    expect(p.after!.games).toBe(105);
    expect(p.steps[1]).toMatch(/^Step 2 came back empty/);
    expect(calls[0].body.reasoning!.effort).toBe('medium');
    expect(calls[2].body.reasoning!.effort).toBe('low');
    expect(calls[2].body.messages.at(-1)!.content).toMatch(/Your last reply never arrived/);
    expect(p.usage.promptTokens).toBe(24000); // the empty step is counted too
  });

  it('after repeated failures, the best mapping tried is still offered', async () => {
    const { fetcher } = fakeModel([JSON.stringify({ try: good }), '']);
    const p = await improveMapping({ wb, current: broken, id: 'x', title: 'x', call: { key: 'k', fetcher } });
    expect(p.stopped).toBe('reply');
    expect(p.after!.games).toBe(105);
    expect(p.mapping!.notes!.at(-1)).toMatch(/stopped early/);
  });

  it('cancelling keeps the best mapping tried, and skips the rules and format', async () => {
    const ctl = new AbortController();
    let n = 0;
    const fetcher = (async (_url: string, init: RequestInit) => {
      if (n++ === 0) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ try: good }) } }] }), { status: 200 });
      setTimeout(() => ctl.abort(), 10);
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }) as unknown as typeof fetch;
    const p = await aiSetup({ wb, current: broken, id: 'x', title: 'x', call: { key: 'k', fetcher, signal: ctl.signal } });
    expect(p.stopped).toBe('cancelled');
    expect(p.error).toBeUndefined();
    expect(p.after!.games).toBe(105);
    expect(n).toBe(2);
  });

  it('out of steps, the best mapping it tried is offered', async () => {
    const worse = { ...good, games: [good.games[1]] };
    const { fetcher, calls } = fakeModel([JSON.stringify({ try: worse }), JSON.stringify({ try: good }), JSON.stringify({ try: worse })]);
    const p = await improveMapping({ wb, current: broken, id: 'x', title: 'x', call: { key: 'k', fetcher }, rounds: 3 });
    expect(calls).toHaveLength(3);
    expect(calls[2].body.messages.at(-1)!.content).toMatch(/Your next reply is the last/);
    expect(p.after!.games).toBe(105);
    expect(p.mapping!.notes).toContain('The AI ran out of steps; this is the best mapping it tried.');
  });

  it('set up with AI: maps the sheet, then reads the rules and fills the format, adding up the cost', async () => {
    const wb2 = loadFixture('outdoor-2');
    const m = detectMapping(wb2).mapping;
    const prompts: string[] = [];
    const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }), { status: 200 });
    const fetcher = (async (_url: string, init: RequestInit) => {
      const msgs = (JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages;
      const sys = msgs[0].content;
      prompts.push(sys.slice(0, 30));
      if (sys.startsWith('You map')) return reply(JSON.stringify({ mapping: m, notes: ['Looks right'] }));
      if (sys.startsWith('Read ultimate')) return reply(JSON.stringify({ points: { win: 3, draw: 1, loss: 0 }, tiebreaks: ['h2hWins', 'diff'] }));
      const keys = msgs[1].content.split('Slots to fill:\n')[1].split('\n').map((l) => l.split(' ')[0]);
      return reply(JSON.stringify({ sources: Object.fromEntries(keys.map((k) => [k, { kind: 'seed', seed: 1 }])) }));
    }) as unknown as typeof fetch;
    const stages: (string | undefined)[] = [];
    const p = await aiSetup({ wb: wb2, current: m, id: 'x', title: 'x', call: { key: 'k', fetcher }, onProgress: (x) => stages.push(x.stage) });
    expect(prompts.map((x) => x.split(' ')[0])).toEqual(['You', 'Read', 'Work']);
    expect(p.error).toBeUndefined();
    expect(p.rulesFromAi).toBe(true);
    expect(p.mapping!.rules).toMatchObject({ points: { win: 3 }, source: 'ai' });
    expect(p.slots).toEqual({ asked: 2, filled: 2 });
    expect(Object.values(p.format!.divisions).flatMap((d) => Object.values(d.sources)).filter((e) => e.origin === 'ai')).toHaveLength(2);
    expect(p.steps.slice(-2)).toEqual(['Read the rules: win 3, draw 1, loss 0, 2 tie-breaks', 'Worked out the format: filled 2 of 2 unknown slots']);
    expect(p.usage.promptTokens).toBe(3000);
    expect([...new Set(stages)]).toEqual(['Mapping the sheet', 'Reading the rules', 'Working out the format']);
    // Rules the user set aren't asked about again.
    prompts.length = 0;
    const mine = { ...m, rules: { points: { win: 2, draw: 1, loss: 0 }, tiebreaks: [], drawsAllowed: { pool: true, placement: false }, source: 'user' as const } };
    const q = await aiSetup({ wb: wb2, current: mine, id: 'x', title: 'x', call: { key: 'k', fetcher } });
    expect(prompts.map((x) => x.split(' ')[0])).toEqual(['You', 'Work']);
    expect(q.mapping!.rules).toBe(mine.rules);
  });

  it('a worse mapping is not offered as better', async () => {
    const worse = { ...good, games: [good.games[1]] }; // Finals only
    const { fetcher } = fakeModel([JSON.stringify({ mapping: worse }), JSON.stringify({ mapping: worse })]);
    const p = await improveMapping({ wb, current: good, id: 'x', title: 'Pitch Hog', call: { key: 'k', fetcher } });
    expect(p.better).toBe(false);
  });

  it('reports a rejected key', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 401 }));
    const p = await improveMapping({ wb, current: good, id: 'x', title: 'x', call: { key: 'bad', fetcher: f as unknown as typeof fetch } });
    expect(p.error).toMatch(/rejected the key/);
    expect(p.errorKind).toBe('key');
  });

  it('never throws: a broken workbook comes back as an error, not a spinner', async () => {
    const { fetcher } = fakeModel(['{}']);
    const p = await improveMapping({ wb: { tabs: null } as never, current: good, id: 'x', title: 'x', call: { key: 'k', fetcher } });
    expect(p.error).toBeTruthy();
  });
});

/** A streamed reply, as OpenRouter sends it: keep-alive comments, reasoning, then content, usage and [DONE]. */
function sse(parts: (string | object)[], delay = 0): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        for (const p of parts) {
          if (delay) await new Promise((r) => setTimeout(r, delay));
          if (init.signal?.aborted) return c.error(new DOMException('aborted', 'AbortError'));
          c.enqueue(enc.encode(typeof p === 'string' ? `${p}

` : `data: ${JSON.stringify(p)}

`));
        }
        c.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
}

/** A request that never answers until it's aborted. */
const hang = (async (_url: string, init: RequestInit) =>
  new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;

describe('model calls', () => {
  const msgs = [{ role: 'user' as const, content: 'hi' }];

  it('streams reasoning and answer, reporting progress', async () => {
    const seen: { thinking: number; writing: number }[] = [];
    const fetcher = sse([': OPENROUTER PROCESSING', { choices: [{ delta: { reasoning: 'hmm, let me see' } }] }, { choices: [{ delta: { content: '{"ok":' } }] }, { choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }, 'data: [DONE]']);
    const r = await callModel({ key: 'k', fetcher, onStream: (p) => seen.push(p) }, msgs);
    expect(r.text).toBe('{"ok":true}');
    expect(r.usage.promptTokens).toBe(10);
    expect(seen[0]).toEqual({ thinking: 15, writing: 0 });
    expect(seen.at(-1)!.writing).toBe(11);
  });

  it('turns HTTP and stream errors into kinds', async () => {
    const status = (n: number, body = '') => (async () => new Response(body, { status: n })) as unknown as typeof fetch;
    await expect(callModel({ key: 'k', fetcher: status(402, '{"error":{"message":"Insufficient credits"}}') }, msgs)).rejects.toMatchObject({ kind: 'credit', message: /Insufficient credits/ });
    await expect(callModel({ key: 'k', fetcher: status(400, '{"error":{"message":"foo/bar is not a valid model ID"}}') }, msgs)).rejects.toMatchObject({ kind: 'model' });
    await expect(callModel({ key: 'k', fetcher: status(503) }, msgs)).rejects.toMatchObject({ kind: 'server' });
    await expect(callModel({ key: 'k', fetcher: sse([{ error: { message: 'Provider returned error', code: 502 }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] }]) }, msgs)).rejects.toMatchObject({ kind: 'server' });
    await expect(callModel({ key: 'k', fetcher: (async () => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch }, msgs)).rejects.toMatchObject({ kind: 'network' });
  });

  it('explains an answer used up by thinking', async () => {
    const fetcher = sse([{ choices: [{ delta: { reasoning: 'x'.repeat(50) }, finish_reason: 'length' }] }]);
    await expect(callModel({ key: 'k', fetcher }, msgs)).rejects.toMatchObject({ kind: 'reply', message: /never wrote an answer/ });
  });

  it('gives up when nothing comes back, and when the stream stalls', async () => {
    await expect(callModel({ key: 'k', fetcher: hang, timeouts: { first: 30, total: 1000 } }, msgs)).rejects.toMatchObject({ kind: 'timeout', message: /didn't answer/ });
    const deaf = (async () => new Promise(() => undefined)) as unknown as typeof fetch; // ignores the abort signal
    await expect(callModel({ key: 'k', fetcher: deaf, timeouts: { first: 30, total: 1000 } }, msgs)).rejects.toMatchObject({ kind: 'timeout' });
    const stall = sse([{ choices: [{ delta: { reasoning: 'a' } }] }, { choices: [{ delta: { content: '{}' } }] }], 80);
    await expect(callModel({ key: 'k', fetcher: stall, timeouts: { first: 1000, idle: 40, total: 1000 } }, msgs)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('can be cancelled, and the mapper reports phases', async () => {
    const ctl = new AbortController();
    const phases: AiProgress['phase'][] = [];
    const wb = loadFixture('list-round-robin');
    const run = improveMapping({ wb, current: detectMapping(wb).mapping, id: 'x', title: 'x', call: { key: 'k', fetcher: hang, signal: ctl.signal }, onProgress: (p) => phases.push(p.phase) });
    setTimeout(() => ctl.abort(), 20);
    const p = await run;
    expect(p.errorKind).toBe('cancelled');
    expect(phases).toEqual(['reading', 'waiting']);
  });
});
