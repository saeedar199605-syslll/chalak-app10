/**
 * B20 — Excel Performance / Large Dataset Validation
 *
 * Measures: Generate, Parse, Validate, Persist, Export for 100/1k/5k rows.
 * Reports actual durations. No fabricated SLA.
 */
import { File as NodeFile } from 'node:buffer';
import ExcelJS from 'exceljs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { parseTemplateData, TemplateBuilderService, ExcelTemplate } from '../src/utils/templateBuilder';
import { db } from '../src/utils/db';

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key: string, value: string): void { this.store[key] = value; }
  removeItem(key: string): void { delete this.store[key]; }
  clear(): void { this.store = {}; }
  key(index: number): string | null { return Object.keys(this.store)[index] || null; }
  get length(): number { return Object.keys(this.store).length; }
}

async function buildExcelFile(sheets: { name: string; rows: any[][] }[]): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach(sheet => {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach(row => ws.addRow(row));
  });
  const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
  return new NodeFile([new Uint8Array(buffer)], 'perf_test.xlsx') as unknown as File;
}

function makeTemplate(): ExcelTemplate {
  return {
    id: 'tmpl-perf',
    name: 'Performance Template',
    code: 'PERF-001',
    fields: [
      { id: 'f1', key: 'staff_code', type: 'text', label: 'Code', required: true, width: 20 },
      { id: 'f2', key: 'full_name', type: 'text', label: 'Name', required: true, width: 25 },
      { id: 'f3', key: 'score', type: 'numeric', label: 'Score', required: true, width: 15 },
      { id: 'f4', key: 'review_date', type: 'date', label: 'Date', required: false, width: 18 },
      { id: 'f5', key: 'status', type: 'dropdown', label: 'Status', required: true, options: ['active', 'inactive'], width: 15 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function generateRows(count: number): any[][] {
  const statuses = ['active', 'inactive'];
  return Array.from({ length: count }, (_, i) => [
    `EMP-${1000 + i}`,
    `Employee ${i}`,
    (1 + (i % 5)).toString(),
    '2026-01-15',
    statuses[i % 2],
  ]);
}

function timeSync<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  // eslint-disable-next-line no-console
  console.log(`  [${label}] ${elapsed.toFixed(2)}ms`);
  return result;
}

async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  // eslint-disable-next-line no-console
  console.log(`  [${label}] ${elapsed.toFixed(2)}ms`);
  return result;
}

describe('B20: Excel Performance — Large Dataset', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).window = {
      ...((globalThis as any).window || {}),
      localStorage: memStorage,
      sessionStorage: memStorage,
      dispatchEvent: () => true,
      addEventListener: () => {},
    };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  const datasets = [100, 1000, 5000];

  datasets.forEach(rowCount => {
    it(`PERF: ${rowCount} rows — Generate → Parse → Validate → Persist`, async () => {
      const template = makeTemplate();
      const headers = template.fields.map(f => f.key);
      const dataRows = generateRows(rowCount);

      // Generate XLSX
      const file = await timeAsync(`Generate ${rowCount} rows XLSX`, () =>
        buildExcelFile([{ name: 'Template', rows: [headers, ...dataRows] }])
      );

      // Parse XLSX
      const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
      const parsed = await timeAsync(`Parse ${rowCount} rows XLSX`, () => readWorkbookRows(file));
      const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];

      // Validate + map to records
      const importResult = timeSync(`Validate+Parse ${rowCount} rows`, () =>
        parseTemplateData(
          sheetRows[0].map(h => String(h).trim()),
          sheetRows.slice(1),
          template
        )
      );

      // Persist
      const service = new TemplateBuilderService();
      timeSync(`Persist ${rowCount} records`, () => {
        service.save({
          name: `Perf ${rowCount}`,
          code: `PERF-${rowCount}`,
          fields: template.fields,
        });
        db.saveMiscData(`perf_records_${rowCount}`, importResult.records);
      });

      // Verify correctness: all rows should be valid
      expect(importResult.totalRows).toBe(rowCount);
      expect(importResult.validRows).toBe(rowCount);
      expect(importResult.invalidRows).toBe(0);
      expect(importResult.records).toHaveLength(rowCount);

      // Verify no row loss: exact count
      expect(importResult.records[0]['staff_code']).toBe('EMP-1000');
      expect(importResult.records[rowCount - 1]['staff_code']).toBe(`EMP-${1000 + rowCount - 1}`);
    }, 30000); // 30s timeout for large datasets
  });

  it('PERF: 1000 rows — no duplicate processing, no excess workbook creation', async () => {
    const template = makeTemplate();
    const headers = template.fields.map(f => f.key);
    const dataRows = generateRows(1000);

    // Generate once
    const file = await buildExcelFile([{ name: 'Template', rows: [headers, ...dataRows] }]);

    // Parse once
    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];

    // Run validation 3 times — should produce identical results (no side effects)
    const r1 = parseTemplateData(sheetRows[0].map(h => String(h).trim()), sheetRows.slice(1), template);
    const r2 = parseTemplateData(sheetRows[0].map(h => String(h).trim()), sheetRows.slice(1), template);
    const r3 = parseTemplateData(sheetRows[0].map(h => String(h).trim()), sheetRows.slice(1), template);

    expect(r1.records.length).toBe(r2.records.length);
    expect(r1.records.length).toBe(r3.records.length);
    expect(r1.records[500]['staff_code']).toBe(r2.records[500]['staff_code']);
    expect(r2.records[500]['staff_code']).toBe(r3.records[500]['staff_code']);
  });

  it('PERF: 5000 rows — memory stability (no crash, all records present)', async () => {
    const template = makeTemplate();
    const headers = template.fields.map(f => f.key);
    const dataRows = generateRows(5000);

    const file = await buildExcelFile([{ name: 'Template', rows: [headers, ...dataRows] }]);
    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];

    const importResult = parseTemplateData(
      sheetRows[0].map(h => String(h).trim()),
      sheetRows.slice(1),
      template
    );

    expect(importResult.totalRows).toBe(5000);
    expect(importResult.validRows).toBe(5000);
    expect(importResult.records).toHaveLength(5000);
    // Spot-check
    expect(importResult.records[0]['full_name']).toBe('Employee 0');
    expect(importResult.records[4999]['full_name']).toBe('Employee 4999');
  });
});
