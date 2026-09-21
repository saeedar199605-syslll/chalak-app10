/**
 * CROSS-MODULE INTEGRATION TEST (B31)
 *
 * Full workflow: Criterion → Job Profile → Employee → Evaluation →
 * Score Calculation → Calibration → Reward → Report
 *
 * Verifies that the SAME entity IDs/data propagate correctly through the chain.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { calculateFinalScore } from '../src/utils/formulaEngine';
import { getGrade } from '../src/types';

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

describe('Cross-Module Integration Test', () => {
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

  it('FULL WORKFLOW: Criterion → Profile → Employee → Eval → Score → Calibrate → Reward', async () => {
    const { db } = await import('../src/utils/db');
    const { evaluateNumericFormula } = await import('../src/utils/formulaEngine');

    // STEP 1: Get seeded criteria
    const criteria = db.getCriteria();
    expect(criteria.length).toBeGreaterThanOrEqual(3); // Need at least 3 for weights summing to 100

    // Pick criteria: HSE (mandatory), KPI, Behavioral
    const hseCrit = criteria.find(c => c.cat === 'S') || criteria[0];
    const kpiCrit = criteria.find(c => c.cat === 'K') || criteria[1];
    const behCrit = criteria.find(c => c.cat === 'B') || criteria[2];

    // STEP 2: Create Job Profile with these criteria (weights sum to 100, HSE mandatory)
    const profile = db.addProfile({
      title: 'Integration Test Operator',
      code: 'INT-TEST-1',
      family: 'Production',
      items: [
        { cid: hseCrit.id, weight: 30 },
        { cid: kpiCrit.id, weight: 40 },
        { cid: behCrit.id, weight: 30 },
      ],
      baseRewardAmount: 5000000,
      locked: false,
    });
    expect(profile.id).toBeDefined();
    expect(profile.items.length).toBe(3);

    // Verify profile persists
    const reloadedProfiles = db.getProfiles();
    const foundProfile = reloadedProfiles.find(p => p.id === profile.id);
    expect(foundProfile).toBeDefined();
    expect(foundProfile!.items.length).toBe(3);

    // STEP 3: Create Employee with this profile
    const { employee } = db.addEmployee({
      name: 'یکپارچه تست',
      code: 'INT-EMP-001',
      unit: 'یکپارچه‌سازی',
      profileId: profile.id,
      role: 'employee',
      username: 'integration_test_emp',
      supervisorId: '',
    });
    expect(employee.profileId).toBe(profile.id);

    // Verify employee persists and has correct profileId
    const reloadedEmployees = db.getEmployees();
    const foundEmp = reloadedEmployees.find(e => e.id === employee.id);
    expect(foundEmp).toBeDefined();
    expect(foundEmp!.profileId).toBe(profile.id);
    expect(foundEmp!.profileId).toBe(foundProfile!.id); // Same ID propagates

    // STEP 4: Create Evaluation with scores for this employee
    const evalRec = {
      id: `ev-integration-${Date.now()}`,
      empId: employee.id,
      profileId: profile.id,
      period: 'یکپارچه ۱۴۰۵',
      status: 'calibrated' as const, // Lock weights for deterministic calculation
      stage: 'calibration_review' as const,
      scores: [
        { cid: hseCrit.id, value: 5, weight: 30, self: 5, selfWeight: 30 }, // 5 * 30 = 150
        { cid: kpiCrit.id, value: 4, weight: 40, self: 4, selfWeight: 40 },   // 4 * 40 = 160
        { cid: behCrit.id, value: 3, weight: 30, self: 3, selfWeight: 30 },   // 3 * 30 = 90
      ],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      created: Date.now(),
      overallNote: '',
    } as any;
    db.saveEvaluations([...db.getEvaluations(), evalRec]);

    // STEP 5: Verify score calculation uses correct criteria weights from profile
    // avg5 = (5*30 + 4*40 + 3*30) / (30+40+30) = (150+160+90)/100 = 4.0
    // result = 4.0 * 20 = 80
    const reloadedEvals = db.getEvaluations();
    const foundEval = reloadedEvals.find(e => e.id === evalRec.id);
    expect(foundEval).toBeDefined();

    // Reload profile from storage for calculation
    const currentProfiles = db.getProfiles();
    const currentProfile = currentProfiles.find(p => p.id === profile.id);
    expect(currentProfile).toBeDefined();

    const score = calculateFinalScore(foundEval!, currentProfiles);
    expect(score).toBe(80);
    expect(getGrade(score)).toBe('B');

    // STEP 6: Simulate calibration approval (status → calibrated, then locked)
    const calibrated = { ...foundEval!, status: 'calibrated' as const, stage: 'hr_approval' as const };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== foundEval!.id), calibrated]);

    const locked = { ...calibrated, status: 'locked' as const, stage: 'completed' as const };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== foundEval!.id), locked]);

    // Verify final state
    const finalEvals = db.getEvaluations();
    const finalEval = finalEvals.find(e => e.id === evalRec.id);
    expect(finalEval!.status).toBe('locked');
    expect(finalEval!.stage).toBe('completed');

    // STEP 7: Calculate reward using the locked evaluation
    // Formula: baseAmount * multiplier
    // baseAmount = profile.baseRewardAmount = 5,000,000
    // score = 80 → multiplier depends on score-range config
    // Let's test with a simple multiplier
    const baseAmount = currentProfile!.baseRewardAmount || 5000000;
    const multiplier = 1.0; // score >= 80 → full multiplier
    const expectedReward = baseAmount * multiplier;
    const actualReward = evaluateNumericFormula('baseAmount * multiplier', {
      baseAmount, multiplier, score: 80,
    });
    expect(actualReward).toBe(expectedReward);

    // STEP 8: Verify all entity IDs are consistent across the chain
    const verifyEmployees = db.getEmployees();
    const verifyProfiles = db.getProfiles();
    const verifyEvals = db.getEvaluations();

    const vEmp = verifyEmployees.find(e => e.id === employee.id);
    const vProf = verifyProfiles.find(p => p.id === profile.id);
    const vEval = verifyEvals.find(e => e.id === evalRec.id);

    expect(vEmp).toBeDefined();
    expect(vProf).toBeDefined();
    expect(vEval).toBeDefined();

    // The employee's profileId should match the profile's id
    expect(vEmp!.profileId).toBe(vProf!.id);

    // The evaluation's empId should match the employee's id
    expect(vEval!.empId).toBe(vEmp!.id);

    // The evaluation's profileId should match the profile's id
    expect(vEval!.profileId).toBe(vProf!.id);

    // Each criterion in the evaluation should exist in the profile
    vEval!.scores.forEach(score => {
      expect(vProf!.items.some(item => item.cid === score.cid)).toBe(true);
    });

    // STEP 9: Export simulation — verify data is consistent for Excel round-trip
    const exportData = {
      employee: { code: vEmp!.code, name: vEmp!.name, unit: vEmp!.unit, profile: vProf!.title },
      scores: vEval!.scores.map(s => ({
        criterionCode: criteria.find(c => c.id === s.cid)?.code,
        score: s.value,
        weight: s.weight,
      })),
      finalScore: score,
      grade: getGrade(score),
      reward: actualReward,
    };

    // Verify we can reconstruct the same score from exported data
    expect(exportData.employee.profile).toBe('Integration Test Operator');
    expect(exportData.scores.length).toBe(3);
    expect(exportData.finalScore).toBe(80);
    expect(exportData.grade).toBe('B');
    expect(exportData.reward).toBe(5000000);
  });

  it('INTEGRATION: Profile deletion cascades to employees but preserves evaluations', async () => {
    const { db } = await import('../src/utils/db');
    const { calculateFinalScore } = await import('../src/utils/formulaEngine');

    const criteria = db.getCriteria();
    const crit = criteria[0];

    const profile = db.addProfile({
      title: 'Cascade Test', code: 'CASCADE-01', family: 'Test',
      items: [{ cid: crit.id, weight: 100 }], baseRewardAmount: 1000000, locked: false,
    });

    const { employee } = db.addEmployee({
      name: 'Cascade Emp', code: 'CAS-EMP', unit: 'T', profileId: profile.id,
      role: 'employee', username: 'cascade_emp',
    });

    // Create evaluation referencing this employee and profile
    const evalRec = {
      id: `ev-cascade-${Date.now()}`, empId: employee.id, profileId: profile.id,
      period: 'CASCADE', status: 'locked' as const, stage: 'completed' as const,
      scores: [{ cid: crit.id, value: 4, weight: 100, self: 4, selfWeight: 100 }],
      history: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      created: Date.now(), overallNote: '',
    } as any;
    db.saveEvaluations([...db.getEvaluations(), evalRec]);

    // Delete the profile (force=true cascades profileId=null on employees)
    const result = db.deleteProfile(profile.id, true);
    expect(result.success).toBe(true);

    // Employee should have profileId cleared
    const reloadedEmp = db.getEmployees().find(e => e.id === employee.id);
    expect(reloadedEmp!.profileId).toBe(''); // Cleared by cascade

    // Evaluation should still exist (evaluations are NOT cascaded on profile delete)
    const reloadedEval = db.getEvaluations().find(e => e.id === evalRec.id);
    expect(reloadedEval).toBeDefined();
    expect(reloadedEval!.empId).toBe(employee.id);

    // Score calculation with deleted profile should fall back to snapshot weights
    const score = calculateFinalScore(reloadedEval!, []); // No profiles available
    // With snapshot weights: 4 * 100 / 100 = 4.0, * 20 = 80
    expect(score).toBe(80);
  });

  it('INTEGRATION: Multiple employees under same profile share criterion weights', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];
    const prof = db.addProfile({
      title: 'Shared Profile', code: 'SHARED-01', family: 'Test',
      items: [{ cid: crit.id, weight: 100 }], baseRewardAmount: 3000000, locked: false,
    });

    // Create 3 employees assigned to same profile
    const { employee: emp1 } = db.addEmployee({
      name: 'Emp A', code: 'EMP-A', unit: 'T', profileId: prof.id, role: 'employee', username: 'emp_a',
    });
    const { employee: emp2 } = db.addEmployee({
      name: 'Emp B', code: 'EMP-B', unit: 'T', profileId: prof.id, role: 'employee', username: 'emp_b',
    });
    const { employee: emp3 } = db.addEmployee({
      name: 'Emp C', code: 'EMP-C', unit: 'T', profileId: prof.id, role: 'employee', username: 'emp_c',
    });

    // Create evaluations with different scores
    const evals = [
      { empId: emp1.id, profileId: prof.id, score: 5 },
      { empId: emp2.id, profileId: prof.id, score: 3 },
      { empId: emp3.id, profileId: prof.id, score: 1 },
    ];
    const evalRecords = evals.map((e, i) => ({
      id: `ev-shared-${i}`, empId: e.empId, profileId: e.profileId,
      period: 'SHARED', status: 'locked' as const, stage: 'completed' as const,
      scores: [{ cid: crit.id, value: e.score, weight: 100, self: e.score, selfWeight: 100 }],
      history: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      created: Date.now(), overallNote: '',
    } as any));
    db.saveEvaluations([...db.getEvaluations(), ...evalRecords]);

    // Verify each employee's score uses the shared profile weights
    const currentProfiles = db.getProfiles();
    const currentEvals = db.getEvaluations();
    const emp1Eval = currentEvals.find(e => e.id === 'ev-shared-0')!;
    const emp2Eval = currentEvals.find(e => e.id === 'ev-shared-1')!;
    const emp3Eval = currentEvals.find(e => e.id === 'ev-shared-2')!;

    expect(calculateFinalScore(emp1Eval, currentProfiles)).toBe(100); // 5*20 = 100 → A
    expect(calculateFinalScore(emp2Eval, currentProfiles)).toBe(60);  // 3*20 = 60 → C
    expect(calculateFinalScore(emp3Eval, currentProfiles)).toBe(20);  // 1*20 = 20 → E
  });
});
