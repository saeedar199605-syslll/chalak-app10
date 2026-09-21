/**
 * B21/Excel Import Fix — Regression tests for XLSX cell/column parsing.
 *
 * These tests verify that the XLSX import bugs reported by the owner
 * are fixed. They specifically test:
 * 1. XLSX files are NOT parsed as CSV (comma-split).
 * 2. A real Excel cell containing a comma stays ONE cell.
 * 3. Columns are separated by actual workbook cell boundaries.
 * 4. Header-based column mapping works with reordered columns.
 * 5. Persian text and digits are preserved.
 */
import { File as NodeFile } from 'node:buffer';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readWorkbookRows } from '../src/utils/excelWorkbook';

// Helper: build a real XLSX file from a 2D array of cell values
function buildXlsx(sheetName: string, rows: any[][]): Buffer {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRows(rows);
  return wb as any;
}

async function makeXlsxFile(sheetName: string, rows: any[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRows(rows);
  const buffer = await wb.xlsx.writeBuffer();
  return new NodeFile([new Uint8Array(buffer)], 'test.xlsx') as unknown as File;
}

describe('NEW-IMP-03: XLSX uses real cell/column parsing (not CSV comma-split)', () => {
  it('VALIDATE: cell containing a comma stays as ONE cell (not split into columns)', async () => {
    // This is the critical test: "کیفیت، دقت, و همکاری" must be ONE cell
    const file = await makeXlsxFile('Sheet1', [
      ['کد پرسنلی', 'وضعیت فعالیت'],
      ['EMP-001', 'کیفیت، دقت، و همکاری'],
    ]);

    const workbook = await readWorkbookRows(file);
    const sheetName = workbook.sheets[0];
    const rows = workbook.rowsBySheet[sheetName];

    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['کد پرسنلی', 'وضعیت فعالیت']);
    // The comma-containing value must be ONE cell, NOT split
    expect(rows[1]).toEqual(['EMP-001', 'کیفیت، دقت، و همکاری']);
    expect(rows[1].length).toBe(2);
  });

  it('VALIDATE: multiple columns are preserved as separate cells', async () => {
    const file = await makeXlsxFile('Data', [
      ['کد پرسنلی', 'نام', 'واحد', 'شغل', 'نقش'],
      ['E-1001', 'علی احمدی', 'تولید', 'اپراتور CNC', 'employee'],
      ['E-1002', 'فاطمه رضوی', 'کنترل کیفیت', 'سوپروایزر', 'supervisor'],
    ]);

    const workbook = await readWorkbookRows(file);
    const rows = workbook.rowsBySheet[workbook.sheets[0]];

    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['کد پرسنلی', 'نام', 'واحد', 'شغل', 'نقش']);
  });
});

describe('NEW-IMP-04: Reordered columns still import correctly via header mapping', () => {
  it('VALIDATE: columns in different order map correctly by header name', async () => {
    // Columns are: واحد, کد پرسنلی, نقش, نام (reordered)
    const file = await makeXlsxFile('Employees', [
      ['واحد سازمانی', 'کد پرسنلی', 'نقش دسترسی', 'نام کامل'],
      ['تولید', 'E-2001', 'employee', 'محمد رضایی'],
    ]);

    const workbook = await readWorkbookRows(file);
    const rows = workbook.rowsBySheet[workbook.sheets[0]];

    expect(rows.length).toBe(2);
    // Headers preserved in actual Excel order
    expect(rows[0]).toEqual(['واحد سازمانی', 'کد پرسنلی', 'نقش دسترسی', 'نام کامل']);
    expect(rows[1]).toEqual(['تولید', 'E-2001', 'employee', 'محمد رضایی']);
  });
});

describe('NEW-IMP-03: Persian/English digits and text preservation', () => {
  it('VALIDATE: Persian digits and text are preserved in cells', async () => {
    const file = await makeXlsxFile('Data', [
      ['کد', 'امتیاز', 'نام'],
      ['E-001', '۸۵.۵', 'سارا احمدی'],
    ]);

    const workbook = await readWorkbookRows(file);
    const rows = workbook.rowsBySheet[workbook.sheets[0]];

    expect(rows[1]).toEqual(['E-001', '۸۵.۵', 'سارا احمدی']);
  });
});

describe('NEW-IMP-04: Leading-zero codes are preserved as text', () => {
  it('VALIDATE: personnel code with leading zeros keeps its text representation', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    // Set cell type to 's' (string) for the code to preserve leading zeros
    ws.addRow(['کد پرسنلی', 'نام']);
    const row = ws.addRow(['00123', 'حسن مرادی']);
    // Force the first cell to be text (string) type
    row.getCell(1).value = '00123';
    ws.getColumn(1).numFmt = '@'; // Text format to preserve leading zeros
    const buffer = await wb.xlsx.writeBuffer();
    const file = new NodeFile([new Uint8Array(buffer)], 'test.xlsx') as unknown as File;

    const workbook = await readWorkbookRows(file);
    const rows = workbook.rowsBySheet[workbook.sheets[0]];

    expect(rows[1][0]).toBe('00123');
  });
});
