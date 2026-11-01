import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { workbookFromXlsx, type Workbook, type XlsxLike } from '../../src/sheets/workbook';

export const FIXTURES = [
  'uku-template',
  'grid-exp-beg',
  'grid-dated',
  'list-round-robin',
  'list-codes',
  'outdoor-1',
  'outdoor-2',
  'outdoor-3',
] as const;
export type FixtureName = (typeof FIXTURES)[number];

const cache = new Map<string, Workbook>();

export function loadFixture(name: FixtureName): Workbook {
  let wb = cache.get(name);
  if (!wb) {
    const path = fileURLToPath(new URL(`../fixtures/sheets/${name}.xlsx`, import.meta.url));
    wb = workbookFromXlsx(XLSX as unknown as XlsxLike, readFileSync(path));
    cache.set(name, wb);
  }
  return wb;
}
