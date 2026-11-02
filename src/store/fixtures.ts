/**
 * Development-only test workbooks, loaded as if fetched from Google. Not included in production builds.
 */
const urls: Record<string, string> = import.meta.env?.DEV
  ? (import.meta.glob('../../test/fixtures/sheets/*.xlsx', { query: '?url', import: 'default', eager: true }) as Record<string, string>)
  : {};

export const FIXTURE_NAMES: string[] = Object.keys(urls).map((p) => p.split('/').pop()!.replace('.xlsx', ''));

export function fixtureUrl(id: string): string | undefined {
  if (!id.startsWith('fixture:')) return undefined;
  const name = id.slice('fixture:'.length);
  const hit = Object.entries(urls).find(([p]) => p.endsWith(`/${name}.xlsx`));
  return hit?.[1];
}
