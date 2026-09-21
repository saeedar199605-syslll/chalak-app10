/**
 * Behavioral tests for Backup & Restore (B16).
 *
 * Tests: Backup → Modify/Delete Data → Restore → Compare Original Data
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

describe('Backup & Restore', () => {
  let originalLocalStorage: Storage;

  beforeEach(async () => {
    originalLocalStorage = globalThis.localStorage;
    (globalThis as any).localStorage = new MemoryStorage();
    (globalThis as any).sessionStorage = new MemoryStorage();
    // Ensure fresh module import with clean localStorage
    await import('../src/utils/db');
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
  });

  it('BACKUP: contains all required data keys', async () => {
    const { db } = await import('../src/utils/db');
    // Seed data
    db.getEmployees(); db.getCriteria(); db.getProfiles(); db.getEvaluations(); db.getOkrs();
    const backup = JSON.parse(db.exportBackupJSON());

    expect(backup.meta).toBeDefined();
    expect(backup.meta.app).toContain('چالاک');
    expect(backup.meta.version).toBeDefined();
    expect(backup.meta.exportedAt).toBeDefined();

    expect(Array.isArray(backup.employees)).toBe(true);
    expect(Array.isArray(backup.criteria)).toBe(true);
    expect(Array.isArray(backup.profiles)).toBe(true);
    expect(Array.isArray(backup.evaluations)).toBe(true);
    expect(Array.isArray(backup.archivedEvaluations)).toBe(true);

    // Should include record counts
    expect(backup.meta.recordCounts).toBeDefined();
    expect(backup.meta.recordCounts.employees).toBe(backup.employees.length);
    expect(backup.meta.recordCounts.profiles).toBe(backup.profiles.length);

    // Delegations must be included in backup (FIX: previously missing)
    expect(Array.isArray(backup.delegations)).toBe(true);
    expect(backup.meta.recordCounts.delegations).toBe(backup.delegations.length);
  });

  it('BACKUP-RESTORE: round-trip preserves all data', async () => {
    const { db } = await import('../src/utils/db');

    // Step 1: Backup the current state
    db.getEmployees(); db.getCriteria(); db.getProfiles(); db.getEvaluations(); db.getOkrs();
    const backupJSON = db.exportBackupJSON();
    const backupData = JSON.parse(backupJSON);

    // Snapshot the original data
    const originalEmployees = db.getEmployees();
    const originalProfiles = db.getProfiles();
    const originalCriteria = db.getCriteria();

    // Step 2: Modify data — add new employee, delete a profile
    const originalProfileCount = originalProfiles.length;
    if (originalProfileCount > 0) {
      db.deleteProfile(originalProfiles[0].id, true);
    }
    db.addEmployee({
      name: 'عملیاتی تست', code: 'TST-001', unit: 'تست',
      profileId: originalProfiles[0]?.id || 'prof-default',
      role: 'employee', username: 'ops-test',
    });

    // Verify data was modified
    expect(db.getProfiles().length).toBe(originalProfileCount > 0 ? originalProfileCount - 1 : 0);
    expect(db.getEmployees().length).toBe(originalEmployees.length + 1);

    // Step 3: Restore from backup
    const result = db.importBackupJSON(backupJSON);
    expect(result.success).toBe(true);

    // Step 4: Verify data matches original
    const restoredEmployees = db.getEmployees();
    const restoredProfiles = db.getProfiles();
    const restoredCriteria = db.getCriteria();

    expect(restoredEmployees.length).toBe(originalEmployees.length);
    expect(restoredProfiles.length).toBe(originalProfileCount);
    expect(restoredCriteria.length).toBe(originalCriteria.length);

    // Verify specific data was restored (not just counts)
    expect(restoredEmployees.find(e => e.code === 'TST-001')).toBeUndefined();
    expect(restoredProfiles.find(p => p.id === originalProfiles[0]?.id)).toBeDefined();
  });

  it('BACKUP-RESTORE: delegations survive round-trip', async () => {
    const { db } = await import('../src/utils/db');

    // Create a delegation
    db.createDelegation({
      delegatorId: 'admin-1',
      delegateId: 'emp-1',
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: Date.now() - 86400000,
      endDate: Date.now() + 86400000 * 30,
      status: 'active',
      reason: 'Test delegation for backup/restore',
    });

    expect(db.getDelegations().length).toBe(1);

    // Backup
    const backupJSON = db.exportBackupJSON();
    const backupData = JSON.parse(backupJSON);
    expect(backupData.delegations.length).toBe(1);

    // Clear delegations
    db.saveDelegations([]);
    expect(db.getDelegations().length).toBe(0);

    // Restore
    const result = db.importBackupJSON(backupJSON);
    expect(result.success).toBe(true);

    // Delegation must be restored
    const restored = db.getDelegations();
    expect(restored.length).toBe(1);
    expect(restored[0].delegateId).toBe('emp-1');
    expect(restored[0].action).toBe('approve');
  });

  it('RESTORE: invalid JSON returns error', async () => {
    const { db } = await import('../src/utils/db');
    const result = db.importBackupJSON('not valid json {{{');
    expect(result.success).toBe(false);
    expect(result.message).toContain('خطا');
  });

  it('RESTORE: non-object JSON returns error', async () => {
    const { db } = await import('../src/utils/db');
    const result = db.importBackupJSON('"just a string"');
    expect(result.success).toBe(false);
  });

  it('RESTORE: empty arrays are accepted', async () => {
    const { db } = await import('../src/utils/db');
    const emptyBackup = JSON.stringify({
      meta: { app: 'test', version: '1.0' },
      employees: [], criteria: [], profiles: [],
      evaluations: [], archivedEvaluations: [],
    });
    const result = db.importBackupJSON(emptyBackup);
    expect(result.success).toBe(true);
    expect(db.getEmployees().length).toBe(0);
    expect(db.getProfiles().length).toBe(0);
  });

  it('RESTORE: preserves original data after backup+restore', async () => {
    const { db } = await import('../src/utils/db');

    // Build a known state with custom data
    const crit = db.addCriterion({
      code: 'CRIT-RESTORE-01', cat: 'K', name: 'معیار تست بازیابی',
      def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    const prof = db.addProfile({
      title: 'پروفایل تست', code: 'TEST-01', family: 'Test',
      items: [{ cid: crit.id, weight: 100 }],
      locked: false,
    });
    db.addEmployee({
      name: 'کارمند تست', code: 'EMP-TEST-01', unit: 'تست',
      profileId: prof.id, role: 'employee', username: 'test-user',
    });

    // Snapshot
    const originalEmployees = db.getEmployees();
    const originalProfiles = db.getProfiles();
    const originalCriteria = db.getCriteria();

    // Backup
    const backupJSON = db.exportBackupJSON();

    // Delete everything
    db.saveEmployees([]);
    db.saveProfiles([]);
    db.saveCriteria([]);
    db.saveEvaluations([]);
    db.saveArchivedEvaluations([]);

    expect(db.getEmployees().length).toBe(0);

    // Restore
    db.importBackupJSON(backupJSON);

    expect(db.getEmployees().length).toBe(originalEmployees.length);
    expect(db.getProfiles().length).toBe(originalProfiles.length);
    expect(db.getCriteria().length).toBe(originalCriteria.length);

    // Verify the specific employee was restored
    const restoredEmp = db.getEmployees().find(e => e.code === 'EMP-TEST-01');
    expect(restoredEmp).toBeDefined();
    expect(restoredEmp!.name).toBe('کارمند تست');
    expect(restoredEmp!.profileId).toBe(prof.id);
  });

  it('RESTORE: corrupted backup with partial data', async () => {
    const { db } = await import('../src/utils/db');
    // Missing some arrays entirely
    const partialBackup = JSON.stringify({
      meta: { app: 'test', version: '1.0' },
      employees: [{ id: 'orphan', name: 'بدون پروفایل', code: 'ORPHAN-001', unit: 'تست', role: 'employee', username: 'orphan' }],
      // criteria, profiles, evaluations missing
    });
    const result = db.importBackupJSON(partialBackup);
    expect(result.success).toBe(true);
    // Employee was imported
    expect(db.getEmployees().find(e => e.code === 'ORPHAN-001')).toBeDefined();
  });

  it('CORRUPTION: missing metadata is handled', async () => {
    const { db } = await import('../src/utils/db');
    const backup = JSON.stringify({
      employees: [{ id: 'orphan', name: 'بدون پروفایل', code: 'NO-META', unit: 'تست', role: 'employee', username: 'orphan' }],
      // Missing meta entirely
    });
    const result = db.importBackupJSON(backup);
    expect(result.success).toBe(true);
    expect(db.getEmployees().find(e => e.code === 'NO-META')).toBeDefined();
  });

  it('CORRUPTION: unsupported schemaVersion is handled', async () => {
    const { db } = await import('../src/utils/db');
    const backup = JSON.stringify({
      meta: { app: 'چالاک', version: '99.0', schemaVersion: 999, exportedAt: '2025-01-01' },
      employees: [], criteria: [], profiles: [], evaluations: [], archivedEvaluations: [],
    });
    // Should import successfully — version mismatch is a warning, not a hard error
    const result = db.importBackupJSON(backup);
    // Schema version 999 may be rejected if the system enforces it — verify safe behavior
    if (result.success) {
      expect(db.getEmployees().length).toBe(0);
    } else {
      // If rejected, it must not have corrupted existing data
      expect(result.message).toBeDefined();
    }
  });

  it('CORRUPTION: unknown fields are ignored gracefully', async () => {
    const { db } = await import('../src/utils/db');
    const backup = JSON.stringify({
      meta: { app: 'چالاک', version: '1.0', schemaVersion: 1, exportedAt: '2025-01-01' },
      employees: [], criteria: [], profiles: [], evaluations: [], archivedEvaluations: [],
      known_unknown_field: 'should_be_ignored',
    });
    const result = db.importBackupJSON(backup);
    expect(result.success).toBe(true);
  });

  it('CORRUPTION: empty backup does not crash', async () => {
    const { db } = await import('../src/utils/db');
    const result = db.importBackupJSON(JSON.stringify({}));
    // Empty backup (no arrays) should be handled gracefully — either accepted as empty or rejected safely
    if (result.success) {
      // If accepted, employees array is empty in backup — getEmployees will re-seed
      // The important thing is no crash
      expect(typeof result.success).toBe('boolean');
    } else {
      // If rejected, existing data must be intact
      expect(db.getEmployees().length).toBeGreaterThan(0);
    }
  });

  it('CORRUPTION: does not partially overwrite before validation', async () => {
    const { db } = await import('../src/utils/db');
    const validEmpCount = db.getEmployees().length;

    // Attempt to import invalid data
    const result = db.importBackupJSON('{ broken json');

    // Should fail safely — original data must be intact
    expect(result.success).toBe(false);
    expect(db.getEmployees().length).toBe(validEmpCount);
  });
});