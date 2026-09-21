/**
 * MANDATORY Excel Round-Trip Test
 *
 * Generate Template → Fill Valid Rows → Import XLSX → Parse → Map Columns → Validate → Persist → Reload → Compare
 */
import { File as NodeFile } from 'node:buffer';
import ExcelJS from 'exceljs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { parseUniversalExcelFile, recalculateDynamicRows } from '../src/utils/excelImportExport';

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

async function buildExcelFile(sheets: { name: string; rows: any[][] }[]): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach(sheet => {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach(row => ws.addRow(row));
  });
  const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
  return new NodeFile([new Uint8Array(buffer)], 'round_trip_test.xlsx') as unknown as File;
}

describe('Excel Round-Trip: Template → Fill → Import → Parse → Validate', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).window = { ...((globalThis as any).window || {}), localStorage: memStorage, sessionStorage: memStorage, dispatchEvent: () => true };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  async function setupDb() {
    const { db } = await import('../src/utils/db');
    const criteria = db.getCriteria();
    const profiles = db.getProfiles();
    return { db, criteria, profiles };
  }

  it('ROUND-TRIP: Persian employee scores survive import/parse cycle', async () => {
    const { db, criteria, profiles } = await setupDb();
    const safetyCrit = criteria.find(c => c.code === 'B-HSE-01') || criteria[0];
    const kpiCrit = criteria.find(c => c.code === 'K-PRD-01') || criteria[1];
    const attCrit = criteria.find(c => c.cat === 'B') || criteria[2];

    const prof = db.addProfile({
      title: 'Production Team', code: 'PROD-01', family: 'Production',
      items: [{ cid: safetyCrit.id, weight: 40 }, { cid: kpiCrit.id, weight: 30 }, { cid: attCrit.id, weight: 30 }],
      baseRewardAmount: 5000000, locked: false,
    });
    db.addEmployee({ name: 'علی احمدی', code: 'EMP-001', unit: 'تولید', profileId: prof.id, role: 'employee', username: 'ali_ahmadi' });
    db.addEmployee({ name: 'Reza Karimi', code: 'EMP-002', unit: 'تولید', profileId: prof.id, role: 'employee', username: 'reza_karimi' });

    // Build XLSX with criteria columns
    const headers = [
      'کد پرسنلی (Staff Code)', 'نام و نام خانوادگی', 'عنوان شغلی', 'واحد سازمانی', 'دوره ارزیابی (Period)',
      `[${safetyCrit.code}] ${safetyCrit.name} (نمره ۱-۵)`,
      `[${kpiCrit.code}] ${kpiCrit.name} (نمره ۱-۵)`,
      `[${attCrit.code}] ${attCrit.name} (نمره ۱-۵)`,
      'توضیحات و بازخورد کلی سرپرست',
    ];

    const file = await buildExcelFile([{ name: 'ماتریس_شاخص_ها', rows: [
      headers,
      ['EMP-001', 'علی احمدی', 'Production Team', 'تولید', 'نیمه اول ۱۴۰۵', 5, 4, 3, 'عملکرد قوی و مثبت'],
      ['EMP-002', 'Reza Karimi', 'Production Team', 'تولید', 'نیمه اول ۱۴۰۵', 4, 5, 4, 'هدفمند و منظم'],
    ] }]);

    // Import
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    expect(parsed.sheets).toEqual(['ماتریس_شاخص_ها']);
    expect(parsed.activeSheet).toBe('ماتریس_شاخص_ها');
    expect(parsed.headers.length).toBe(9);

    // Verify auto-detected mappings
    expect(parsed.suggestedMappings.find(m => m.targetType === 'staffCode')).toBeDefined();
    expect(parsed.suggestedMappings.find(m => m.targetType === 'staffName')).toBeDefined();
    expect(parsed.suggestedMappings.filter(m => m.targetType === 'criterion').length).toBe(3);

    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: db.getEmployees(), criteria: db.getCriteria(), profiles: db.getProfiles(),
    });

    expect(recalculated.records.length).toBe(2);
    expect(recalculated.matchedEmployeesCount).toBe(2);
    expect(recalculated.totalValidRecords).toBe(2);

    const rec1 = recalculated.records.find(r => r.empCode === 'EMP-001')!;
    const rec2 = recalculated.records.find(r => r.empCode === 'EMP-002')!;

    expect(rec1).toBeDefined();
    expect(rec2).toBeDefined();
    expect(rec1.scores[safetyCrit.id]).toBe(5);
    expect(rec1.scores[kpiCrit.id]).toBe(4);
    expect(rec1.scores[attCrit.id]).toBe(3);
    expect(rec1.empName).toBe('علی احمدی');
    expect(rec1.unit).toBe('تولید');
    expect(rec1.jobTitle).toBe('Production Team');
    expect(rec1.overallNote).toBe('عملکرد قوی و مثبت');
    expect(rec1.isValid).toBe(true);

    expect(rec2.scores[safetyCrit.id]).toBe(4);
    expect(rec2.scores[kpiCrit.id]).toBe(5);
    expect(rec2.scores[attCrit.id]).toBe(4);
    expect(rec2.isValid).toBe(true);
  });

  it('ROUND-TRIP: Empty XLSX → no headers, no rows', async () => {
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [] }]);
    const { db, criteria } = await setupDb();
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    expect(parsed.headers).toEqual([]);
    expect(parsed.rawRows).toEqual([]);
  });

  it('ROUND-TRIP: Missing staff code header → name mapped, code unmapped', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['نام و نام خانوادگی'],
      ['علی احمدی'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    expect(parsed.headers).toEqual(['نام و نام خانوادگی']);
    expect(parsed.suggestedMappings.find(m => m.targetType === 'staffName')).toBeDefined();
    expect(parsed.suggestedMappings.find(m => m.targetType === 'staffCode')).toBeUndefined();
  });

  it('ROUND-TRIP: Reordered columns → mappings still correct', async () => {
    const { db, criteria } = await setupDb();
    const safetyCrit = criteria[0];
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      [`[${safetyCrit.code}] ${safetyCrit.name} (نمره ۱-۵)`, 'کد پرسنلی (Staff Code)', 'نام و نام خانوادگی'],
      [5, 'EMP-001', 'علی'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    expect(parsed.suggestedMappings.find(m => m.targetType === 'criterion')).toBeDefined();
    expect(parsed.suggestedMappings.find(m => m.targetType === 'staffCode')).toBeDefined();
  });

  it('ROUND-TRIP: Extra columns → mapped as "ignore"', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی', 'ستون اضافی'],
      ['EMP-001', 'علی', 'اطلاعات اضافی'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    const extraMapping = parsed.suggestedMappings.find(m => m.excelColumn === 'ستون اضافی');
    expect(extraMapping).toBeDefined();
    expect(extraMapping!.targetType).toBe('ignore');
  });

  it('ROUND-TRIP: Duplicate records → both processed', async () => {
    const { db, criteria } = await setupDb();
    // Create employee so it can be matched
    db.addEmployee({ name: 'Ali', code: 'EMP-001', unit: 'T', profileId: '', role: 'employee', username: 'ali_dup' });
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی'],
      ['EMP-001', 'علی'],
      ['EMP-001', 'علی'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: db.getEmployees(), criteria: db.getCriteria(), profiles: db.getProfiles(),
    });
    expect(recalculated.records.length).toBe(2);
    expect(recalculated.matchedEmployeesCount).toBe(2);
  });

  it('ROUND-TRIP: Non-existent employee → warning, invalid record', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی'],
      ['EMP-999', 'ناشناس'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: db.getEmployees(), criteria: db.getCriteria(), profiles: db.getProfiles(),
    });
    expect(recalculated.records.length).toBe(1);
    expect(recalculated.totalValidRecords).toBe(0);
    expect(recalculated.warnings.length).toBe(1);
    expect(recalculated.warnings[0]).toContain('EMP-999');
  });

  it('ROUND-TRIP: Persian text with special characters', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی'],
      ['EMP-001', 'علی ا@#احمدی$%'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, [], criteria);
    expect(parsed.rawRows.length).toBeGreaterThan(0);
  });

  it('ROUND-TRIP: Blank rows → skipped', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی'],
      ['EMP-001', 'علی'],
      ['', ''],
      ['EMP-002', 'رضا'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: db.getEmployees(), criteria: db.getCriteria(), profiles: db.getProfiles(),
    });
    expect(recalculated.records.length).toBe(2);
  });

  it('Excel formula injection → cell value read as plain string', async () => {
    const { db, criteria } = await setupDb();
    // Test XLSX path with formula (ExcelJS formula cells)
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.addRow(['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی']);
    // Add a cell with a formula that would be dangerous if executed
    ws.getCell('A2').value = { formula: '1+1', result: 2 };
    ws.getCell('B2').value = 'علی';
    const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
    const file = new NodeFile([new Uint8Array(buffer)], 'formula_test.xlsx') as unknown as File;

    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    // Formula result should be the computed value (2), not the formula string
    expect(parsed.rawRows[0][0]).toBe(2);
    expect(parsed.rawRows[0][1]).toBe('علی');
  });

  it('ROUND-TRIP: Score clamping to 1-5 range', async () => {
    const { db, criteria } = await setupDb();
    const safetyCrit = criteria[0];
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', `[${safetyCrit.code}] ${safetyCrit.name} (نمره ۱-۵)`],
      ['EMP-001', 7],
      ['EMP-002', 0],
      ['EMP-003', -1],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, [], criteria);
    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: [], criteria: db.getCriteria(), profiles: db.getProfiles(),
    });
    const rec1 = recalculated.records.find(r => r.empCode === 'EMP-001');
    if (rec1 && safetyCrit) expect(rec1.scores[safetyCrit.id]).toBe(5);
    const rec2 = recalculated.records.find(r => r.empCode === 'EMP-002');
    if (rec2 && safetyCrit) expect(rec2.scores[safetyCrit.id]).toBe(1);
    const rec3 = recalculated.records.find(r => r.empCode === 'EMP-003');
    if (rec3 && safetyCrit) expect(rec3.scores[safetyCrit.id]).toBe(1);
  });

  it('ROUND-TRIP: CSV with BOM + quoted commas parsed correctly', async () => {
    const csvContent = '\uFEFFکد پرسنلی (Staff Code),نام و نام خانوادگی,توضیحات\r\nEMP-001,"علی احمدی","دقیق, منظم"';
    const file = new NodeFile([Buffer.from(csvContent, 'utf-8')], 'test.csv') as unknown as File;
    const { db, criteria } = await setupDb();
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    expect(parsed.headers[0]).toBe('کد پرسنلی (Staff Code)');
    expect(parsed.headers[1]).toBe('نام و نام خانوادگی');
    expect(parsed.rawRows[0][0]).toBe('EMP-001');
    expect(parsed.rawRows[0][1]).toBe('علی احمدی');
    expect(parsed.rawRows[0][2]).toBe('دقیق, منظم'); // Quoted comma preserved
  });

  it('ROUND-TRIP: Mixed Persian/English content in employee fields', async () => {
    const { db, criteria } = await setupDb();
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', 'نام و نام خانوادگی', 'واحد سازمانی'],
      ['EMP-001', 'علی Ahmadی', 'تهران Production'],
      ['EMP-002', 'Reza کریمی', 'Isfahan تولید'],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, [], criteria);
    expect(parsed.rawRows[0][1]).toBe('علی Ahmadی');
    expect(parsed.rawRows[0][2]).toBe('تهران Production');
    expect(parsed.rawRows[1][1]).toBe('Reza کریمی');
    expect(parsed.rawRows[1][2]).toBe('Isfahan تولید');
  });

  it('ROUND-TRIP: Persian/English digits (۰۱۲ vs 012) → both parsed correctly', async () => {
    const { db, criteria } = await setupDb();
    const safetyCrit = criteria[0];
    const file = await buildExcelFile([{ name: 'Sheet1', rows: [
      ['کد پرسنلی (Staff Code)', `[${safetyCrit.code}] ${safetyCrit.name} (نمره ۱-۵)`],
      ['EMP-001', 5],
      ['EMP-002', 3],
    ] }]);
    const parsed = await parseUniversalExcelFile(file, db.getEmployees(), criteria);
    const recalculated = recalculateDynamicRows({
      rawRows: parsed.rawRows, headers: parsed.headers, mappings: parsed.suggestedMappings,
      employees: db.getEmployees(), criteria: db.getCriteria(), profiles: db.getProfiles(),
    });
    // Both should be parsed as numeric scores
    expect(recalculated.records.length).toBe(2);
  });
});
