import { describe, expect, it, vi } from 'vitest';
import { datesFromTitle, isBlank, parseDate, parseDuration, parseScore, parseTime, parseWeekday } from '../src/sheets/cells';
import { parseSheetLink, parseTabListing, sourceKey, tabCsvUrl, tabKey, workbookUrl } from '../src/sheets/links';
import { fetchTabCsv, fetchWorkbook, SheetFetchError } from '../src/sheets/fetch';
import { cell, findTab } from '../src/sheets/workbook';
import { loadFixture } from './helpers/fixtures';

describe('links', () => {
  it('parses share, publish and bare ids', () => {
    expect(parseSheetLink('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=12')).toEqual({
      kind: 'share',
      id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      gid: '12',
    });
    expect(parseSheetLink('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz/pubhtml')).toMatchObject({
      kind: 'publish',
      pubId: '2PACX-1vQabcdefghijklmnopqrstuvwxyz',
    });
    expect(parseSheetLink('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toMatchObject({ kind: 'share' });
    expect(parseSheetLink('not a link')).toBeUndefined();
  });

  it('builds endpoints with cache busting', () => {
    const src = { kind: 'share' as const, id: 'abc' };
    expect(workbookUrl(src)).toMatch(/\/d\/abc\/export\?format=xlsx&_cb=/);
    expect(tabCsvUrl({ kind: 'publish', pubId: 'p' }, '5', false)).toBe(
      'https://docs.google.com/spreadsheets/d/e/p/pub?gid=5&single=true&output=csv',
    );
    expect(sourceKey({ kind: 'publish', pubId: 'p' })).toBe('e:p');
  });

  it('parses the htmlview tab listing', () => {
    const html = `<html><head><title>Open Cup/Plate Sheet - Google Drive</title></head><script>
      items.push({name: "Open Cup\\/Plate", pageUrl: "https:\\/\\/x", gid: "123"});
      items.push({name: "Gamelist", pageUrl: "https:\\/\\/y", gid: "0"});</script>`;
    const l = parseTabListing(html);
    expect(l.title).toBe('Open Cup/Plate Sheet');
    expect(l.tabs).toEqual([
      { name: 'Open Cup/Plate', gid: '123' },
      { name: 'Gamelist', gid: '0' },
    ]);
    expect(tabKey('Open Cup/Plate')).toBe(tabKey('Open CupPlate'));
  });
});

describe('cell parsing', () => {
  it.each([
    ['09:30', 570],
    ['0900', 540],
    ['1633.0', 993],
    ['9:00 AM', 540],
    ['2:05 PM', 845],
    ['12:30 PM', 750],
    ['14:14:00', 854],
    ['1900-01-08 09:27:00', 567],
    ['Sat @ 09:15', 555],
    ['9:15', 555],
    ['0.3958333333', 570],
  ])('time %s', (s, v) => expect(parseTime(s)).toBe(v));

  it('rejects non-times', () => {
    expect(parseTime('Lunch')).toBeUndefined();
    expect(parseTime('A1vA3')).toBeUndefined();
    expect(parseTime('12')).toBeUndefined();
  });

  it('parses dates', () => {
    const ref = new Date(Date.UTC(2026, 9, 1));
    expect(parseDate('2026-10-24')).toBe('2026-10-24');
    expect(parseDate('24/10/2026')).toBe('2026-10-24');
    expect(parseDate('Saturday 24 October', ref)).toBe('2026-10-24');
    expect(parseDate('Sunday 25th October', ref)).toBe('2026-10-25');
    expect(parseDate('24 Oct 2026')).toBe('2026-10-24');
    expect(parseDate('SATURDAY')).toBeUndefined();
    expect(parseWeekday('SATURDAY')).toBe('Saturday');
  });

  it('parses dates from titles', () => {
    const ref = new Date(Date.UTC(2026, 1, 1));
    expect(datesFromTitle('Uni Outdoors (28-29 March)', ref)).toEqual(['2026-03-28', '2026-03-29']);
    expect(datesFromTitle('U20 Nationals 19 Sep 2026')).toEqual(['2026-09-19']);
    expect(datesFromTitle('Tour 11-12 July', ref)).toEqual(['2026-07-11', '2026-07-12']);
  });

  it('parses placeholders, scores and durations', () => {
    for (const s of ['#N/A', '#REF!', 'X', 'TBC', 'TBD', '-', '?', '']) expect(isBlank(s)).toBe(true);
    expect(isBlank('Leeds 1')).toBe(false);
    expect(parseScore('12.0')).toEqual({ n: 12 });
    expect(parseScore('w')).toEqual({ mark: 'W' });
    expect(parseScore('F')).toEqual({ forfeit: true });
    expect(parseDuration('00:24')).toBe(24);
    expect(parseDuration('25 mins')).toBe(25);
    expect(parseDuration('01:30')).toBe(90);
  });
});

describe('workbook model', () => {
  it('anchors at A1, keeps display text, hidden flags, links and dates', () => {
    const wb = loadFixture('uku-template');
    const gl = findTab(wb, 'Gamelist')!;
    expect(cell(gl, 0, 0)).toBe('Game');
    expect(cell(gl, 1, 0)).toBe('A1vA3');
    expect(cell(gl, 1, 2)).toBe('Saturday');
    expect(gl.dates?.['1,2']).toBe('2026-10-31');
    const hdr = findTab(wb, 'Header')!;
    expect(Object.values(hdr.links ?? {}).some((l) => l.includes('forms'))).toBe(true);
    const codes = loadFixture('list-codes');
    expect(findTab(codes, 'Helpers')!.hidden).toBe(true);
    expect(findTab(codes, 'Open Cup/Plate')?.name).toBe('Open CupPlate');
    // Tab whose used range starts at B1 still indexes from column A
    const pr = findTab(wb, 'Pool Results')!;
    expect(cell(pr, 2, 1)).toBe('A1vA3');
  });
});

describe('fetch errors', () => {
  const src = { kind: 'share' as const, id: 'abc' };
  const asFetch = (f: unknown) => f as typeof fetch;
  it('detects a sign-in page as private', async () => {
    const f = vi.fn(async () => new Response('<html><title>Sign-in</title>accounts.google.com</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(fetchWorkbook(src, asFetch(f))).rejects.toMatchObject({ kind: 'private' });
  });
  it('maps 404 to notFound', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(fetchTabCsv(src, '0', asFetch(f))).rejects.toBeInstanceOf(SheetFetchError);
    await expect(fetchTabCsv(src, '0', asFetch(f))).rejects.toMatchObject({ kind: 'notFound' });
  });
  it('maps thrown fetch to network', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchTabCsv(src, '0', asFetch(f))).rejects.toMatchObject({ kind: 'network' });
  });
  it('parses csv', async () => {
    const f = vi.fn(async () => new Response('a,b\n"x, y",2\n', { status: 200 }));
    expect(await fetchTabCsv(src, '0', asFetch(f))).toEqual([['a', 'b'], ['x, y', '2'], ['']]);
  });
});
