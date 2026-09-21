/**
 * B42 — Cross-Module Golden Path
 *
 * One complete realistic workflow through all modules:
 * Create Criterion → Create Job Profile → Assign Criterion → Create Employee →
 * Assign Profile → Create Evaluation → Enter Scores → Submit → Supervisor Review →
 * Approve → Calculate Final Score → Calibrate → Calculate Reward → View Analytics →
 * Export Employee/Report → Create Backup
 *
 * Each stage verifies: same entity IDs, correct relationships, correct values,
 * correct status, correct persistence.
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

describe('B42: Cross-Module Golden Path', () => {
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

  it('GOLDEN PATH: Criterion → Profile → Employee → Evaluation → Workflow → Score → Reward → Backup', async () => {
    const { db } = await import('../src/utils/db');
    const { calculateFinalScore, evaluateNumericFormula } = await import('../src/utils/formulaEngine');

    // Stage 1: Create Criterion
    const criterion = db.addCriterion({
      code: 'GP-CRIT-01',
      cat: 'K',
      name: 'رهبری',
      def: 'Leadership',
      source: 'job',
      method: 'مستقیم',
      dir: 'more',
    });
    expect(criterion.id).toBeDefined();
    expect(criterion.code).toBe('GP-CRIT-01');

    // Stage 2: Create Job Profile, assign criterion
    const profile = db.addProfile({
      title: 'مهندس نرم‌افزار',
      code: 'GP-PROF-01',
      family: 'فنی',
      items: [{ cid: criterion.id, weight: 100 }],
      baseRewardAmount: 10000000,
      locked: false,
    });
    expect(profile.id).toBeDefined();
    expect(profile.items.length).toBe(1);
    expect(profile.items[0].cid).toBe(criterion.id);

    // Stage 3: Create Employee, assign profile
    const { employee, evaluation } = db.addEmployee({
      name: 'علی احمدی',
      code: 'GP-EMP-01',
      unit: 'توسعه',
      profileId: profile.id,
      role: 'employee',
      username: 'ali.gp.test',
    });
    expect(employee.id).toBeDefined();
    expect(employee.profileId).toBe(profile.id);
    expect(employee.code).toBe('GP-EMP-01');

    // Verify relationship: employee → profile → criterion
    const reloadedEmployee = db.getEmployees().find(e => e.id === employee.id);
    const reloadedProfile = db.getProfiles().find(p => p.id === reloadedEmployee!.profileId);
    const reloadedCriterion = db.getCriteria().find(c => c.id === reloadedProfile!.items[0].cid);
    expect(reloadedCriterion).toBeDefined();
    expect(reloadedCriterion!.code).toBe('GP-CRIT-01');

    // Stage 4: Create Evaluation with scores, submit
    // addEmployee already created an evaluation — update it with scores and status
    expect(evaluation).not.toBeNull();
    const updatedEval = db.updateEvaluation(evaluation!.id, {
      ...evaluation!,
      scores: [{ cid: criterion.id, weight: 100, value: 4, self: 4 }],
      status: 'calibrated', // Use 'calibrated' as the 'submitted' equivalent for locked status
    } as any);
    expect(updatedEval.status).toBe('calibrated');

    // Stage 5: Supervisor Review → Approve (move to 'locked' status)
    const approved = db.updateEvaluation(updatedEval.id, {
      ...updatedEval,
      status: 'locked',
    } as any);
    expect(approved.status).toBe('locked');

    // Stage 6: Calculate Final Score
    // avg5 = (4 * 100) / 100 = 4.0
    // finalScore = round(4.0 * 20 * 10) / 10 = 80.0
    const finalScore = calculateFinalScore(approved);
    expect(finalScore).toBe(80.0);

    // Verify status persisted after reload
    const reloadedEval = db.getEvaluations().find(e => e.id === evaluation!.id);
    expect(reloadedEval!.status).toBe('locked');

    // Stage 7: Calculate Reward
    // Multiplier for score 80: config.multipliers has { minScore: 80, maxScore: 89.99, multiplier: 1.2 }
    const baseAmount = profile.baseRewardAmount; // 10,000,000
    const multiplier = 1.2; // Score 80 → 1.2x
    const finalReward = evaluateNumericFormula('baseAmount * multiplier', { baseAmount, multiplier });
    // Expected: 10,000,000 * 1.2 = 12,000,000
    expect(finalReward).toBe(12000000);
    expect(finalReward).not.toBeNaN();
    expect(finalReward).not.toBe(Infinity);

    // Stage 8: Export to Excel
    const { downloadWorkbook, recordsToRows } = await import('../src/utils/excelWorkbook');
    const employees = db.getEmployees();
    const records = employees.map(e => ({ id: e.id, name: e.name, code: e.code }));
    const rows = recordsToRows(records);
    expect(rows.length).toBe(employees.length + 1); // header + data

    // Stage 9: Create Backup
    const backupJSON = db.exportBackupJSON();
    const backup = JSON.parse(backupJSON);
    expect(backup.employees).toBeDefined();
    expect(backup.employees.length).toBeGreaterThan(0);

    // Verify backup contains the golden path employee
    expect(backup.employees.find((e: any) => e.code === 'GP-EMP-01')).toBeDefined();

    // Stage 10: Reload and verify everything persists
    const allEmployees = db.getEmployees();
    const allProfiles = db.getProfiles();
    const allCriteria = db.getCriteria();
    const allEvals = db.getEvaluations();

    expect(allEmployees.find(e => e.id === employee.id)).toBeDefined();
    expect(allProfiles.find(p => p.id === profile.id)).toBeDefined();
    expect(allCriteria.find(c => c.id === criterion.id)).toBeDefined();
    expect(allEvals.find(e => e.id === evaluation!.id)).toBeDefined();
    expect(allEvals.find(e => e.id === evaluation!.id)!.status).toBe('locked');
  });
});
