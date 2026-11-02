/**
 * Development-only test workbooks, loaded as if fetched from Google. Not included in production builds.
 */
const loaders: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? (import.meta.glob('../../test/fixtures/sheets/*.xlsx', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>)
  : {};

export const FIXTURE_NAMES: string[] = Object.keys(loaders).map((p) => p.split('/').pop()!.replace('.xlsx', ''));

export const isFixture = (id: string) => id.startsWith('fixture:');

export async function fixtureUrl(id: string): Promise<string | undefined> {
  if (!isFixture(id)) return undefined;
  const name = id.slice('fixture:'.length);
  const hit = Object.entries(loaders).find(([p]) => p.endsWith(`/${name}.xlsx`));
  return hit ? hit[1]() : undefined;
}
