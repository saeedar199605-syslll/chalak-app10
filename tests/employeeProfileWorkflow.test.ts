/**
 * Behavioral tests for the Employee → Job Profile Assignment Workflow.
 *
 * Tests the full chain: Create Profile → Create Employee with Profile →
 * Persist → Reload → Edit → Change Profile → Save → Reload
 *
 * These tests use a MemoryStorage mock (same pattern as dbReseed.test.ts)
 * because the test environment does not have a browser localStorage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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

describe('Employee → Job Profile Assignment Workflow (Behavioral)', () => {
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
    };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  it('STEP 1: Create Profile → Create Employee with Profile → Persist → Reload', async () => {
    const { db } = await import('../src/utils/db');
    const { validateEmployeeInput } = await import('../src/utils/validation');

    // First access seeds criteria/profiles
    const criteria = db.getCriteria();
    expect(criteria.length).toBeGreaterThan(0);

    // Create a job profile
    const safetyCrit = criteria.find(c => c.code === 'B-HSE-01') || criteria[0];
    const kpiCrit = criteria.find(c => c.code === 'K-PRD-01') || criteria[1];
    const savedProf = db.addProfile({
      title: 'Test Operator',
      code: 'OP-TEST',
      family: 'Production',
      items: [
        { cid: safetyCrit.id, weight: 40 },
        { cid: kpiCrit.id, weight: 60 },
      ],
      baseRewardAmount: undefined,
      locked: false,
    });

    // Verify profile is persisted
    const reloadedProfiles = db.getProfiles();
    expect(reloadedProfiles).toContainEqual(expect.objectContaining({ id: savedProf.id, code: 'OP-TEST' }));

    // Create an employee with this profile
    const empValidation = validateEmployeeInput({
      name: 'Test Employee',
      code: 'EMP-001',
      unit: 'Production Floor',
      profileId: savedProf.id,
      role: 'employee',
      username: 'test_employee',
    });
    expect(empValidation.success).toBe(true);
    if (!empValidation.success) throw new Error('Employee validation should pass');
    const { employee: savedEmp } = db.addEmployee(empValidation.data);

    // Verify employee has correct profileId
    const reloadedEmployees = db.getEmployees();
    const found = reloadedEmployees.find(e => e.id === savedEmp.id);
    expect(found).toBeDefined();
    expect(found!.profileId).toBe(savedProf.id);
  });

  it('STEP 2: Reload App (re-init from localStorage) → Profile Selection Persists', async () => {
    const { db } = await import('../src/utils/db');

    // Setup: create profile and employee
    const criteria = db.getCriteria();
    const crit = criteria[0];
    const prof = db.addProfile({
      title: 'Reload Test Profile',
      code: 'RLD-TEST',
      family: 'Testing',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });

    const empVal = db.addEmployee({
      name: 'Reload Test Employee',
      code: 'EMP-002',
      unit: 'Test Unit',
      profileId: prof.id,
      role: 'employee',
      username: 'reload_emp',
    });

    // Simulate app reload: call getProfiles() and getEmployees() which read from localStorage
    const profilesAfterReload = db.getProfiles();
    const employeesAfterReload = db.getEmployees();

    const reloadedProfile = profilesAfterReload.find(p => p.id === prof.id);
    const reloadedEmployee = employeesAfterReload.find(e => e.id === empVal.employee.id);

    expect(reloadedProfile).toBeDefined();
    expect(reloadedEmployee).toBeDefined();
    expect(reloadedEmployee!.profileId).toBe(prof.id);
    expect(reloadedEmployee!.profileId).toBe(reloadedProfile!.id);
  });

  it('STEP 3: Edit Employee → Change Profile → Save → Reload', async () => {
    const { db } = await import('../src/utils/db');

    // Create two profiles
    const criteria = db.getCriteria();
    const crit = criteria[0];
    const prof1 = db.addProfile({
      title: 'First Profile',
      code: 'PROF-1',
      family: 'Family A',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });
    const prof2 = db.addProfile({
      title: 'Second Profile',
      code: 'PROF-2',
      family: 'Family B',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });

    // Create employee with prof1
    const { employee } = db.addEmployee({
      name: 'Change Profile Test',
      code: 'EMP-003',
      unit: 'Unit',
      profileId: prof1.id,
      role: 'employee',
      username: 'change_prof',
    });

    // Edit: change profile to prof2
    db.updateEmployee(employee.id, {
      name: 'Change Profile Test',
      code: 'EMP-003',
      unit: 'Unit',
      profileId: prof2.id,
      role: 'employee',
      username: 'change_prof',
    });

    // Reload and verify
    const reloadedEmployees = db.getEmployees();
    const reloaded = reloadedEmployees.find(e => e.id === employee.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.profileId).toBe(prof2.id);
  });

  it('STEP 4: Employee with non-existent profileId (invalid reference)', async () => {
    const { db } = await import('../src/utils/db');

    // Create employee with a non-existent profileId
    const { employee } = db.addEmployee({
      name: 'Invalid Profile Test',
      code: 'EMP-004',
      unit: 'Unit',
      profileId: 'non-existent-profile-id',
      role: 'employee',
      username: 'invalid_prof',
    });

    // Reload: profileId is stored but profile won't be found
    const reloadedEmployees = db.getEmployees();
    const reloaded = reloadedEmployees.find(e => e.id === employee.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.profileId).toBe('non-existent-profile-id');

    // Profile lookup fails gracefully
    const profiles = db.getProfiles();
    const matchingProfile = profiles.find(p => p.id === reloaded!.profileId);
    expect(matchingProfile).toBeUndefined();
  });

  it('STEP 5: Deleted profile → employee profileId is cleared (orphaned)', async () => {
    const { db } = await import('../src/utils/db');

    // Create profile and employee
    const criteria = db.getCriteria();
    const crit = criteria[0];
    const prof = db.addProfile({
      title: 'To Be Deleted',
      code: 'DEL-PROF',
      family: 'Will Be Deleted',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });
    const { employee } = db.addEmployee({
      name: 'Orphan Profile Test',
      code: 'EMP-005',
      unit: 'Unit',
      profileId: prof.id,
      role: 'employee',
      username: 'orphan_prof',
    });

    // Delete the profile (force=true clears employee profileId)
    db.deleteProfile(prof.id, true);

    // Employee should still exist but profileId is cleared by the cascade
    const reloadedEmployees = db.getEmployees();
    const reloaded = reloadedEmployees.find(e => e.id === employee.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.profileId).toBe(''); // Cleared by deleteProfile force=true
    expect(db.getProfiles().find(p => p.id === prof.id)).toBeUndefined();
  });

  it('STEP 6: Create New Profile After Employee Exists → Assign', async () => {
    const { db } = await import('../src/utils/db');

    const criteria = db.getCriteria();
    const crit = criteria[0];

    // Create employee first (with a temporary profile)
    const tempProf = db.addProfile({
      title: 'Temp Profile',
      code: 'TEMP-01',
      family: 'Temp',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });
    const { employee } = db.addEmployee({
      name: 'Reassign Test',
      code: 'EMP-006',
      unit: 'Unit',
      profileId: tempProf.id,
      role: 'employee',
      username: 'reassign_test',
    });

    // Now create a new profile
    const newProf = db.addProfile({
      title: 'New Profile',
      code: 'NEW-01',
      family: 'New Family',
      items: [{ cid: crit.id, weight: 100 }],
      baseRewardAmount: undefined,
      locked: false,
    });

    // Reassign employee to new profile
    db.updateEmployee(employee.id, {
      name: 'Reassign Test',
      code: 'EMP-006',
      unit: 'Unit',
      profileId: newProf.id,
      role: 'employee',
      username: 'reassign_test',
    });

    // Reload and verify
    const reloadedEmployees = db.getEmployees();
    const reloaded = reloadedEmployees.find(e => e.id === employee.id);
    expect(reloaded!.profileId).toBe(newProf.id);
    expect(db.getProfiles().find(p => p.id === newProf.id)).toBeDefined();
  });
});
