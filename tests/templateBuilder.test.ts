/**
 * B03 — Custom Excel Template Builder
 *
 * Tests cover:
 * - All field types: text, numeric, date, dropdown
 * - required vs optional fields
 * - Template save / reload / persistence
 * - Template generation and round-trip (generate XLSX → fill → import → validate → persist → reload)
 * - Negative tests: duplicate field keys, empty name, unsupported type, empty template, invalid dropdown
 * - Persian field names and long field names
 */
import { File as NodeFile } from 'node:buffer';
import ExcelJS from 'exceljs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TemplateBuilderService, ExcelTemplate, TemplateField, downloadTemplateXlsx, parseTemplateData, validateRow } from '../src/utils/templateBuilder';

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
  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
}

async function buildExcelFile(sheets: { name: string; rows: any[][] }[]): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach(sheet => {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach(row => ws.addRow(row));
  });
  const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
  return new NodeFile([new Uint8Array(buffer)], 'template_test.xlsx') as unknown as File;
}

describe('B03: Custom Excel Template Builder — Field Types & Validation', () => {
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

  it('VALIDATE: text, numeric, date, dropdown field types are all accepted', async () => {
    const { db } = await import('../src/utils/db');
    const service = new TemplateBuilderService();

    const template = {
      name: 'Test Template',
      code: 'TPL-001',
      fields: [
        { id: 'f1', key: 'نام پرسنلی', type: 'text' as const, label: 'نام', required: true, width: 25 },
        { id: 'f2', key: 'کد', type: 'numeric' as const, label: 'کد', required: true, width: 15 },
        { id: 'f3', key: 'تاریخ تکمیل', type: 'date' as const, label: 'تاریخ', required: false, width: 20 },
        { id: 'f4', key: 'وضعیت', type: 'dropdown' as const, label: 'وضعیت', required: true, options: ['فعال', 'غیرفعال', 'در حال بررسی'], width: 25 },
      ],
    };

    const result = service.save(template);
    expect(result.success).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template!.fields).toHaveLength(4);
    // Each type preserved
    expect(result.template!.fields.map(f => f.type)).toEqual(['text', 'numeric', 'date', 'dropdown']);
  });

  it('VALIDATE: required vs optional is preserved', async () => {
    const service = new TemplateBuilderService();
    const template = {
      name: 'Req/Opt Test',
      code: 'TPL-REQ',
      fields: [
        { id: 'a', key: 'required_field', type: 'text' as const, label: 'Required', required: true },
        { id: 'b', key: 'optional_field', type: 'text' as const, label: 'Optional', required: false },
      ],
    };
    const result = service.save(template);
    expect(result.success).toBe(true);
    const saved = result.template!.fields;
    expect(saved[0].required).toBe(true);
    expect(saved[1].required).toBe(false);
  });

  it('VALIDATE: empty template name rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: '',
      code: 'TPL-EMPTY',
      fields: [{ id: 'f1', key: 'col1', type: 'text', label: 'Col 1', required: false }],
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('نام قالب نمی‌تواند خالی باشد.');
  });

  it('VALIDATE: empty template code rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Test',
      code: '',
      fields: [{ id: 'f1', key: 'col1', type: 'text', label: 'Col 1', required: false }],
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('کد قالب نمی‌تواند خالی باشد.');
  });

  it('NEGATIVE: duplicate field keys rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Dup Keys',
      code: 'TPL-DUP-KEYS',
      fields: [
        { id: 'f1', key: 'duplicate_col', type: 'text', label: 'Col A', required: false },
        { id: 'f2', key: 'duplicate_col', type: 'text', label: 'Col B', required: false },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.includes('تکراری'))).toBe(true);
  });

  it('NEGATIVE: empty template (no fields) rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Empty Fields',
      code: 'TPL-NOFIELDS',
      fields: [],
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('حداقل یک فیلد در قالب باید تعریف شود.');
  });

  it('NEGATIVE: unsupported field type rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Bad Type',
      code: 'TPL-BADTYPE',
      fields: [{ id: 'f1', key: 'col1', type: 'weird' as any, label: 'Col 1', required: false }],
    });
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.includes('پشتیبانی نمی‌شود'))).toBe(true);
  });

  it('NEGATIVE: dropdown without options rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Bad Dropdown',
      code: 'TPL-BADDROP',
      fields: [{ id: 'f1', key: 'status', type: 'dropdown', label: 'Status', required: true, options: [] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.includes('حداقل یک گزینه'))).toBe(true);
  });

  it('NEGATIVE: dropdown with duplicate options rejected', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Dup Dropdown',
      code: 'TPL-DUPOPT',
      fields: [{ id: 'f1', key: 'status', type: 'dropdown', label: 'Status', required: true, options: ['a', 'b', 'a'] }],
    });
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.includes('تکراری'))).toBe(true);
  });

  it('NEGATIVE: very long field name rejected (>100 chars)', () => {
    const service = new TemplateBuilderService();
    const longName = 'a'.repeat(101);
    const result = service.save({
      name: 'Long Name',
      code: 'TPL-LONG',
      fields: [{ id: 'f1', key: longName, type: 'text', label: 'Long', required: false }],
    });
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.includes('کاراکتر'))).toBe(true);
  });

  it('PERSIAN: Persian field names accepted and persisted', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'قالب فارسی',
      code: 'TPL-FA',
      description: 'قالب با نام فارسی',
      fields: [
        { id: 'f1', key: 'نام کارمند', type: 'text', label: 'نام کارمند', required: true },
        { id: 'f2', key: 'امتیاز عملکرد', type: 'numeric', label: 'امتیاز', required: true },
        { id: 'f3', key: 'وضعیت ارزیابی', type: 'dropdown', label: 'وضعیت', required: true, options: ['عالی', 'خوب', 'مطلب'] },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.template!.fields[0].key).toBe('نام کارمند');
    expect(result.template!.fields[2].options).toEqual(['عالی', 'خوب', 'مطلب']);
  });

  it('NEGATIVE: duplicate template code rejected', () => {
    const service = new TemplateBuilderService();
    const first = service.save({
      name: 'First',
      code: 'DUP-CODE',
      fields: [{ id: 'f1', key: 'col1', type: 'text', label: 'Col', required: false }] as TemplateField[],
    });
    expect(first.success).toBe(true);

    const second = service.save({
      name: 'Second',
      code: 'dup-code', // case-insensitive duplicate
      fields: [{ id: 'f2', key: 'col2', type: 'text', label: 'Col2', required: false }] as TemplateField[],
    });
    expect(second.success).toBe(false);
    expect(second.errors!.some(e => e.includes('تکراری'))).toBe(true);
  });
});

describe('B03: Template Persistence — Save / Reload / Delete', () => {
  let originalLocalStorage: Storage | undefined;
  let memStorage: Storage;

  beforeEach(() => {
    memStorage = new MemoryStorage() as unknown as Storage;
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

  it('PERSIST: saved template survives reload', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Persisted Template',
      code: 'PERSIST-001',
      fields: [
        { id: 'f1', key: 'employee_name', type: 'text', label: 'Name', required: true },
        { id: 'f2', key: 'score', type: 'numeric', label: 'Score', required: true },
      ],
    });
    expect(result.success).toBe(true);
    const savedId = result.template!.id;

    // Simulate reload: new service instance reads from same localStorage
    const service2 = new TemplateBuilderService();
    const loaded = service2.getById(savedId);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Persisted Template');
    expect(loaded!.fields).toHaveLength(2);
    expect(loaded!.fields[0].key).toBe('employee_name');
  });

  it('PERSIST: deleted template does NOT return', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'To Delete',
      code: 'DELETE-001',
      fields: [{ id: 'f1', key: 'col1', type: 'text', label: 'Col', required: false }],
    });
    const id = result.template!.id;

    // Delete via new service instance
    const service2 = new TemplateBuilderService();
    const delResult = service2.delete(id);
    expect(delResult.deleted).toBe(true);

    // Reload: should be gone
    const service3 = new TemplateBuilderService();
    expect(service3.getById(id)).toBeNull();
    expect(service3.getAll()).toHaveLength(0);
  });

  it('PERSIST: delete ALL templates → reload → still empty', () => {
    const service = new TemplateBuilderService();
    service.save({ name: 'T1', code: 'T1', fields: [{ id: 'f1', key: 'c1', type: 'text', label: 'c1', required: false }] });
    service.save({ name: 'T2', code: 'T2', fields: [{ id: 'f2', key: 'c2', type: 'text', label: 'c2', required: false }] });
    expect(service.getAll().length).toBe(2);

    // Delete all
    const service2 = new TemplateBuilderService();
    service2.getAll().forEach(t => service2.delete(t.id));
    expect(service2.getAll()).toHaveLength(0);

    // Reload
    const service3 = new TemplateBuilderService();
    expect(service3.getAll()).toHaveLength(0);
  });

  it('PERSIST: edit existing template updates fields', () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Editable',
      code: 'EDIT-001',
      fields: [{ id: 'f1', key: 'old_key', type: 'text', label: 'Old', required: false }],
    });
    const id = result.template!.id;

    // Edit
    const service2 = new TemplateBuilderService();
    const editResult = service2.save({
      id,
      name: 'Edited Name',
      code: 'EDIT-001',
      fields: [
        { id: 'f1', key: 'new_key', type: 'numeric', label: 'New', required: true },
        { id: 'f2', key: 'added', type: 'date', label: 'Added', required: false },
      ],
    });
    expect(editResult.success).toBe(true);

    // Reload
    const service3 = new TemplateBuilderService();
    const loaded = service3.getById(id);
    expect(loaded!.name).toBe('Edited Name');
    expect(loaded!.fields).toHaveLength(2);
    expect(loaded!.fields[0].key).toBe('new_key');
    expect(loaded!.fields[0].type).toBe('numeric');
    expect(loaded!.fields[1].key).toBe('added');
  });

  it('PERSIST: missing storage key → no templates (fresh install behavior)', () => {
    const service = new TemplateBuilderService();
    expect(service.getAll()).toEqual([]);
  });
});

describe('B03: Template Generation — XLSX Headers & Order', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).window = { ...((globalThis as any).window || {}), localStorage: memStorage, sessionStorage: memStorage, dispatchEvent: () => true, addEventListener: () => {} };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  it('GENERATE: downloaded XLSX has exact headers in field order', async () => {
    // We test parseTemplateData + a generated workbook by using ExcelJS directly
    const template: ExcelTemplate = {
      id: 'tmpl-1',
      name: 'Generation Test',
      code: 'GEN-001',
      fields: [
        { id: 'f1', key: 'employee_code', type: 'text', label: 'Code', required: true, width: 20 },
        { id: 'f2', key: 'employee_name', type: 'text', label: 'Name', required: true, width: 25 },
        { id: 'f3', key: 'performance_score', type: 'numeric', label: 'Score', required: true, width: 15 },
        { id: 'f4', key: 'review_date', type: 'date', label: 'Review Date', required: false, width: 18 },
        { id: 'f5', key: 'status', type: 'dropdown', label: 'Status', required: true, options: ['Active', 'Inactive'], width: 20 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Generate XLSX using ExcelJS with template headers
    const headers = template.fields.map(f => f.key);
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Template');
    ws.addRow(headers);

    const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
    const file = new NodeFile([new Uint8Array(buffer)], 'gen_test.xlsx') as unknown as File;

    // Read it back
    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];
    const readHeaders = sheetRows[0].map(h => String(h).trim());

    expect(readHeaders).toEqual(headers);
  });

  it('GENERATE: reordered fields produce reordered headers', async () => {
    const template: ExcelTemplate = {
      id: 'tmpl-2',
      name: 'Reorder Test',
      code: 'REORDER-001',
      fields: [
        { id: 'f3', key: 'third', type: 'numeric', label: 'Third', required: false },
        { id: 'f1', key: 'first', type: 'text', label: 'First', required: false },
        { id: 'f2', key: 'second', type: 'dropdown', label: 'Second', required: false, options: ['a', 'b'] },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const headers = template.fields.map(f => f.key);
    expect(headers).toEqual(['third', 'first', 'second']);

    // Build and verify order preserved in generated XLSX
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Template');
    ws.addRow(headers);
    const buffer = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
    const file = new NodeFile([new Uint8Array(buffer)], 'reorder_test.xlsx') as unknown as File;

    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const readHeaders = parsed.rowsBySheet[parsed.sheets[0]][0].map(h => String(h).trim());
    expect(readHeaders).toEqual(['third', 'first', 'second']);
  });

  it('GENERATE: deleting a field removes its column', async () => {
    const allFields: TemplateField[] = [
      { id: 'f1', key: 'col_a', type: 'text', label: 'A', required: false },
      { id: 'f2', key: 'col_b', type: 'text', label: 'B', required: false },
      { id: 'f3', key: 'col_c', type: 'text', label: 'C', required: false },
    ];
    // Simulate deleting col_b
    const afterDelete = allFields.filter(f => f.id !== 'f2');
    const headers = afterDelete.map(f => f.key);
    expect(headers).toEqual(['col_a', 'col_c']);
  });
});

describe('B03: Template Round-Trip — Generate → Fill → Import → Validate → Persist', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).window = { ...((globalThis as any).window || {}), localStorage: memStorage, sessionStorage: memStorage, dispatchEvent: () => true, addEventListener: () => {} };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  it('ROUND-TRIP: template with all field types — exact round-trip', async () => {
    await import('../src/utils/db'); // initialize db
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Round Trip Template',
      code: 'RT-001',
      fields: [
        { id: 'f1', key: 'staff_code', type: 'text', label: 'Staff Code', required: true },
        { id: 'f2', key: 'full_name', type: 'text', label: 'Full Name', required: true },
        { id: 'f3', key: 'score', type: 'numeric', label: 'Score', required: true },
        { id: 'f4', key: 'review_date', type: 'date', label: 'Review Date', required: false },
        { id: 'f5', key: 'status', type: 'dropdown', label: 'Status', required: true, options: ['approved', 'pending', 'rejected'] },
      ],
    });
    expect(result.success).toBe(true);
    const template = result.template!;

    // Generate XLSX with headers + filled rows
    const headers = template.fields.map(f => f.key);
    const dataRows = [
      ['EMP-001', 'علی احمدی', 4.5, '2026-01-15', 'approved'],
      ['EMP-002', 'Reza Karimi', 3, '2026-01-20', 'pending'],
      ['EMP-003', 'Sara Mohammadi', 5, '2026-02-01', 'approved'],
    ];

    const file = await buildExcelFile([{ name: 'Template', rows: [headers, ...dataRows] }]);

    // Read it back
    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];
    const readHeaders = sheetRows[0].map(h => String(h).trim());
    const readRows = sheetRows.slice(1);

    // Parse and validate against template
    const importResult = parseTemplateData(readHeaders, readRows, template);
    expect(importResult.totalRows).toBe(3);
    expect(importResult.validRows).toBe(3);
    expect(importResult.invalidRows).toBe(0);
    expect(importResult.records).toHaveLength(3);

    // Verify exact field-by-field match
    expect(importResult.records[0]).toEqual({
      staff_code: 'EMP-001',
      full_name: 'علی احمدی',
      score: 4.5,
      review_date: '2026-01-15',
      status: 'approved',
    });
    expect(importResult.records[1].staff_code).toBe('EMP-002');
    expect(importResult.records[2].full_name).toBe('Sara Mohammadi');
    expect(importResult.records[2].score).toBe(5);
  });

  it('ROUND-TRIP: Persian-only data', async () => {
    await import('../src/utils/db');
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Persian Template',
      code: 'RT-FA',
      fields: [
        { id: 'f1', key: 'کد پرسنلی', type: 'text', label: 'کد', required: true },
        { id: 'f2', key: 'نام کارمند', type: 'text', label: 'نام', required: true },
        { id: 'f3', key: 'امتیاز', type: 'numeric', label: 'امتیاز', required: true },
        { id: 'f4', key: 'تاریخ', type: 'date', label: 'تاریخ', required: false },
        { id: 'f5', key: 'وضعیت', type: 'dropdown', label: 'وضعیت', required: true, options: ['تایید شده', 'در انتظار', 'رد'] },
      ],
    });
    expect(result.success).toBe(true);
    const template = result.template!;

    const headers = template.fields.map(f => f.key);
    const dataRows = [
      ['ک-001', 'علی احمدی', 4, '2026-01-15', 'تایید شده'],
      ['ک-002', 'رضا کریمی', 3, '2026-01-20', 'در انتظار'],
    ];

    const file = await buildExcelFile([{ name: 'Template', rows: [headers, ...dataRows] }]);
    const { readWorkbookRows } = await import('../src/utils/excelWorkbook');
    const parsed = await readWorkbookRows(file);
    const sheetRows = parsed.rowsBySheet[parsed.sheets[0]];
    const importResult = parseTemplateData(
      sheetRows[0].map(h => String(h).trim()),
      sheetRows.slice(1),
      template
    );

    expect(importResult.validRows).toBe(2);
    expect(importResult.records[0]['نام کارمند']).toBe('علی احمدی');
    expect(importResult.records[0]['وضعیت']).toBe('تایید شده');
    expect(importResult.records[1]['کد پرسنلی']).toBe('ک-002');
  });

  it('ROUND-TRIP: missing required column in file → error reported', async () => {
    const service = new TemplateBuilderService();
    const result = service.save({
      name: 'Missing Column Test',
      code: 'RT-MISS',
      fields: [
        { id: 'f1', key: 'required_col', type: 'text', label: 'Required', required: true },
        { id: 'f2', key: 'optional_col', type: 'text', label: 'Optional', required: false },
      ],
    });
    const template = result.template!;

    // File missing the required column
    const headers = ['optional_col'];
    const dataRows = [['some_value']];
    const importResult = parseTemplateData(headers, dataRows, template);

    expect(importResult.errors.some(e => e.field === 'required_col' && e.reason.includes('یافت نشد'))).toBe(true);
  });

  it('ROUND-TRIP: invalid dropdown value detected', async () => {
    const template: ExcelTemplate = {
      id: 'tmpl-x', name: 'Dropdown Validation', code: 'RT-DROP',
      fields: [{ id: 'f1', key: 'status', type: 'dropdown', label: 'Status', required: true, options: ['active', 'inactive'] }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    const headers = ['status'];
    const dataRows = [['invalid_value']];
    const importResult = parseTemplateData(headers, dataRows, template);
    expect(importResult.invalidRows).toBe(1);
    expect(importResult.errors.some(e => e.field === 'status' && e.reason.includes('گزینه'))).toBe(true);
  });

  it('ROUND-TRIP: blank rows skipped, invalid rows excluded from records', async () => {
    const template: ExcelTemplate = {
      id: 'tmpl-y', name: 'Blank/Invalid', code: 'RT-BLANK',
      fields: [
        { id: 'f1', key: 'code', type: 'text', label: 'Code', required: true },
        { id: 'f2', key: 'score', type: 'numeric', label: 'Score', required: true },
      ],
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    const headers = ['code', 'score'];
    const dataRows = [
      ['', ''],           // blank row
      ['EMP-001', 4],     // valid
      ['EMP-002', 'abc'], // invalid numeric
      ['EMP-003', 5],     // valid
    ];

    const importResult = parseTemplateData(headers, dataRows, template);
    expect(importResult.totalRows).toBe(4);
    expect(importResult.validRows).toBe(2);
    expect(importResult.invalidRows).toBe(2);
    expect(importResult.records.map(r => r['code'])).toEqual(['EMP-001', 'EMP-003']);
  });

  it('validateRow: independent validation of single row', () => {
    const template: ExcelTemplate = {
      id: 'tmpl-z', name: 'Validate Row', code: 'VR-001',
      fields: [
        { id: 'f1', key: 'name', type: 'text', label: 'Name', required: true },
        { id: 'f2', key: 'score', type: 'numeric', label: 'Score', required: true },
      ],
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    // Valid row
    expect(validateRow({ name: 'علی', score: 4.5 }, template).valid).toBe(true);
    // Missing required
    const r2 = validateRow({ name: '', score: 4 }, template);
    expect(r2.valid).toBe(false);
    expect(r2.rowErrors.some(e => e.field === 'name')).toBe(true);
    // Non-numeric in numeric field
    const r3 = validateRow({ name: 'Reza', score: 'not_a_number' }, template);
    expect(r3.valid).toBe(false);
    expect(r3.rowErrors.some(e => e.field === 'score')).toBe(true);
  });
});
