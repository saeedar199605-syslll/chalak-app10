/**
 * Behavioral tests for Update / Migration / Extensibility (B17).
 *
 * Tests the schema version compatibility and migration infrastructure
 * that protects users during updates.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

class MemoryStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] || null; }
  get length(): number { return this.store.size; }
}

describe('Update / Migration / Extensibility (B17)', () => {
  let originalLocalStorage: Storage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    (globalThis as any).localStorage = new MemoryStorage();
    (globalThis as any).sessionStorage = new MemoryStorage();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('BACKUP: includes schemaVersion in meta', async () => {
    const { db } = await import('../src/utils/db');
    db.getEmployees(); db.getCriteria(); db.getProfiles();
    const backup = JSON.parse(db.exportBackupJSON());
    expect(backup.meta.schemaVersion).toBeDefined();
    expect(typeof backup.meta.schemaVersion).toBe('number');
  });

  it('BACKUP: includes recordCounts in meta', async () => {
    const { db } = await import('../src/utils/db');
    db.getEmployees(); db.getCriteria(); db.getProfiles();
    const backup = JSON.parse(db.exportBackupJSON());
    expect(backup.meta.recordCounts).toBeDefined();
    expect(backup.meta.recordCounts.employees).toBe(db.getEmployees().length);
  });

  it('RESTORE: rejects incompatible (higher) schema version', async () => {
    const { db } = await import('../src/utils/db');
    const futureBackup = JSON.stringify({
      meta: { app: 'test', version: '99.0.0', schemaVersion: 99 },
      employees: [], criteria: [], profiles: [],
      evaluations: [], archivedEvaluations: [],
    });
    const result = db.importBackupJSON(futureBackup);
    expect(result.success).toBe(false);
    expect(result.message).toContain('نسخه اسکیمای فایل');
  });

  it('RESTORE: accepts compatible (equal) schema version', async () => {
    const { db } = await import('../src/utils/db');
    const compatBackup = JSON.stringify({
      meta: { app: 'test', version: '4.0.0-Cloudflare', schemaVersion: 1 },
      employees: [], criteria: [], profiles: [],
      evaluations: [], archivedEvaluations: [],
    });
    const result = db.importBackupJSON(compatBackup);
    expect(result.success).toBe(true);
  });

  it('RESTORE: accepts backup without schemaVersion (legacy compatibility)', async () => {
    const { db } = await import('../src/utils/db');
    const legacyBackup = JSON.stringify({
      meta: { app: 'old', version: '3.0', exportedAt: '2024-01-01' },
      employees: [], criteria: [], profiles: [],
      evaluations: [], archivedEvaluations: [],
    });
    const result = db.importBackupJSON(legacyBackup);
    expect(result.success).toBe(true);
  });
});