import { describe, expect, it, vi } from 'vitest';
import { buildMappingPrompt, callModel, improveMapping, parseMappingReply, sampleWorkbook, stats, type AiProgress } from '../src/mapping/ai';
import { detectMapping } from '../src/mapping/detect';
import { extract } from '../src/extract/extract';
import { emptyMapping } from '../src/mapping/types';
import { loadFixture } from './helpers/fixtures';

/** A scripted fake model: returns the given replies in order. */
function fakeModel(replies: string[]) {
  let i = 0;
  const calls: { body: { messages: { role: string; content: string }[] } }[] = [];
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
  });

  it('the prompt shows what the current mapping reads, and junk overrides are dropped', () => {
    const wb2 = loadFixture('outdoor-2');
    const m = detectMapping(wb2).mapping;
    const t = extract(wb2, m, { id: 'x', sheetUrl: '' });
    const msgs = buildMappingPrompt(wb2, 'x', m, stats(t, m, wb2), t);
    expect(msgs[1].content).toMatch(/What the current mapping reads:\nDivision "Open" \(code O\): \d+ games, \d+ teams: .*\(seed 1\)/);
    const reply = JSON.stringify({ mapping: { ...m, corrections: { teamDivisions: { a: 'Women', b: 3 }, ignoreRows: ['Gamelist!4', 7] } } });
    const parsed = parseMappingReply(reply, wb2, m);
    expect(parsed.mapping!.corrections.teamDivisions).toEqual({ a: 'Women' });
    expect(parsed.mapping!.corrections.ignoreRows).toEqual(['Gamelist!4']);
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
