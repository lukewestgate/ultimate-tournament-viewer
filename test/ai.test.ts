import { describe, expect, it, vi } from 'vitest';
import { buildMappingPrompt, improveMapping, sampleWorkbook, stats } from '../src/mapping/ai';
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
    expect(p.error).toMatch(/key was rejected/);
  });
});
