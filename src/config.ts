export interface TabConfig {
  gid: string;
  /** Minimum ms between refreshes of this tab. */
  every: number;
}

export interface TournamentConfig {
  slug: string;
  name: string;
  publishId: string;
  sheetUrl: string;
  timeZone: string;
  /** Fallback dates if the Schedule tab can't be read (yyyy-mm-dd). */
  dates: Record<string, string>;
  tabs: {
    header: TabConfig;
    seeding: TabConfig;
    schedule: TabConfig;
    poolResults: TabConfig;
    gamelist: TabConfig;
    standings: TabConfig;
    sotg: TabConfig;
  };
}

const MIN = 60_000;

export const TOURNAMENTS: TournamentConfig[] = [
  {
    slug: 'yemu-indoor-regionals-2026',
    name: 'Yorkshire & East Mids University Mixed Indoor Regionals',
    publishId: '2PACX-1vQF79upDfQ5BpZpN-4eSZ22OzcppoHSs8U4lfVUPMQIs8OOKu9-Z4oA8qBxZRVBR0bWuwHhaaBWUNk8',
    sheetUrl:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQF79upDfQ5BpZpN-4eSZ22OzcppoHSs8U4lfVUPMQIs8OOKu9-Z4oA8qBxZRVBR0bWuwHhaaBWUNk8/pubhtml',
    timeZone: 'Europe/London',
    dates: { Saturday: '2026-10-31', Sunday: '2026-11-01' },
    tabs: {
      header: { gid: '304455124', every: 0 },
      seeding: { gid: '646683490', every: 10 * MIN },
      schedule: { gid: '0', every: 10 * MIN },
      poolResults: { gid: '366787109', every: 0 },
      gamelist: { gid: '2039993329', every: 0 },
      standings: { gid: '707391525', every: 0 },
      sotg: { gid: '2138120578', every: 5 * MIN },
    },
  },
];

export const csvUrl = (t: TournamentConfig, gid: string) =>
  `https://docs.google.com/spreadsheets/d/e/${t.publishId}/pub?gid=${gid}&single=true&output=csv`;

export type TabKey = keyof TournamentConfig['tabs'];
