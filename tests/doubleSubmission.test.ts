/**
 * B48 — Double-Submission / Idempotency Tests
 *
 * Tests that rapid repeated actions don't create duplicate records or
 * duplicate state transitions.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

class MemoryStorage {
  [key: string]: any;
  private _store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
  }
  setItem(key: string, value: string): void { this._store[key] = value; (this as any)[key] = value; }
  removeItem(key: string): void { delete this._store[key]; delete (this as any)[key]; }
  clear(): void { this._store = {}; }
  key(index: number): string | null { return Object.keys(this._store)[index] || null; }
  get length(): number { return Object.keys(this._store).length; }
}

describe('B48: Double-Submission — Prevent Duplicate Records', () => {
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

  it('DOUBLE-SUBMIT: adding same employee code twice creates separate records (component-level dedup is UI concern)', async () => {
    const { db } = await import('../src/utils/db');
    const countBefore = db.getEmployees().length;

    // Add employee with same code twice (db level doesn't dedup by code)
    db.addEmployee({
      name: 'تکراری', code: 'DUP-CODE-001', unit: 'تست',
      profileId: '', role: 'employee', username: 'dup1',
    });
    db.addEmployee({
      name: 'تکراری ۲', code: 'DUP-CODE-001', unit: 'تست',
      profileId: '', role: 'employee', username: 'dup2',
    });

    const countAfter = db.getEmployees().length;
    // DB layer allows duplicates — deduplication is a component/ui concern
    expect(countAfter).toBe(countBefore + 2);
  });

  it('DOUBLE-SUBMIT: evaluation status transition is idempotent', async () => {
    const { db } = await import('../src/utils/db');
    // Create an employee (which auto-creates an evaluation)
    const profiles = db.getProfiles();
    const created = db.addEmployee({
      name: 'تکراری ارزیابی', code: 'DUP-EVAL-001', unit: 'تست',
      profileId: profiles[0]?.id || '', role: 'employee', username: 'dupeval',
    });
    expect(created.evaluation).not.toBeNull();

    const evalId = created.evaluation!.id;
    const target = db.getEvaluations().find(e => e.id === evalId);
    expect(target).toBeDefined();

    // Simulate double status change (rapid clicks) — using 'calibrated' which is a valid status
    const first = db.updateEvaluation(target!.id, { ...target!, status: 'calibrated' });
    const second = db.updateEvaluation(target!.id, { ...first, status: 'calibrated' });

    const reloaded = db.getEvaluations().find(e => e.id === target!.id);
    expect(reloaded!.status).toBe('calibrated');
  });

  it('DOUBLE-SUBMIT: saveEmployee is idempotent for the same data', async () => {
    const { db } = await import('../src/utils/db');
    const employees = db.getEmployees();
    const target = employees[0];

    // Save the same data twice — should not create duplicates
    const result1 = db.updateEmployee(target.id, { ...target, name: 'Updated Name' });
    const result2 = db.updateEmployee(target.id, { ...result1!, name: 'Updated Name' });

    const reloaded = db.getEmployees();
    const updated = reloaded.find(e => e.id === target.id);
    expect(updated!.name).toBe('Updated Name');
    // Still the same count — no duplicate
    expect(reloaded.length).toBe(employees.length);
  });

  it('DOUBLE-SUBMIT: backup-then-import is idempotent', async () => {
    const { db } = await import('../src/utils/db');

    // Create backup
    const backupJSON = db.exportBackupJSON();
    const count1 = db.getEmployees().length;

    // Import backup (should be idempotent — same data)
    const result1 = db.importBackupJSON(backupJSON);
    expect(result1.success).toBe(true);
    const count2 = db.getEmployees().length;
    expect(count2).toBe(count1);

    // Import again — still same
    const result2 = db.importBackupJSON(backupJSON);
    expect(result2.success).toBe(true);
    const count3 = db.getEmployees().length;
    expect(count3).toBe(count1);
  });

  it('DOUBLE-SUBMIT: profile assignment change is consistent after double-save', async () => {
    const { db } = await import('../src/utils/db');
    const employees = db.getEmployees();
    const profiles = db.getProfiles();
    if (profiles.length >= 2) {
      const target = employees[0];
      const newProfileId = profiles[1].id;

      // Double-set the same profile
      const r1 = db.updateEmployee(target.id, { ...target, profileId: newProfileId });
      const r2 = db.updateEmployee(target.id, { ...r1!, profileId: newProfileId });

      const reloaded = db.getEmployees().find(e => e.id === target.id);
      expect(reloaded!.profileId).toBe(newProfileId);
    }
  });
});
