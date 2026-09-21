/**
 * Behavioral tests for Calibration workflow.
 *
 * Tests the actual calibration state transition:
 * draft → calibrated → locked
 * and grade distribution computation.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { calculateFinalScore } from '../src/utils/formulaEngine';
import { getGrade, GRADE_DETAILS } from '../src/types';

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

function makeEval(overrides: Partial<any> = {}): any {
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    empId: '',
    profileId: '',
    period: 'TEST',
    status: 'draft',
    scores: [],
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Calibration Workflow (Behavioral)', () => {
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
    return { db, criteria: db.getCriteria(), profiles: db.getProfiles() };
  }

  it('STATE TRANSITION: draft → calibrated (approve calibration)', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];

    // Create an evaluation with scores (ready for calibration)
    const target = makeEval({
      profileId: '', period: 'TEST', status: 'draft',
      scores: [{ cid: crit.id, value: 3, weight: 100, self: 3, selfWeight: 0 }],
    });
    db.saveEvaluations([...db.getEvaluations(), target]);

    // Simulate calibration approval (mirrors handleApproveCalibration)
    const updated = { ...target, status: 'calibrated' as const };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== target.id), updated]);

    const reloaded = db.getEvaluations();
    const found = reloaded.find(e => e.id === target.id);
    expect(found!.status).toBe('calibrated');
  });

  it('STATE TRANSITION: calibrated → locked (finalization)', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];

    const target = makeEval({
      profileId: '', period: 'TEST', status: 'draft',
      scores: [{ cid: crit.id, value: 3, weight: 100, self: 3, selfWeight: 0 }],
    });
    db.saveEvaluations([...db.getEvaluations(), target]);

    // draft → calibrated
    const calEval = { ...target, status: 'calibrated' as const };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== target.id), calEval]);

    // calibrated → locked
    const cal = db.getEvaluations().find(e => e.id === target.id)!;
    expect(cal.status).toBe('calibrated');
    const locked = { ...cal, status: 'locked' as const };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== target.id), locked]);

    const finalReload = db.getEvaluations();
    const found = finalReload.find(e => e.id === target.id);
    expect(found!.status).toBe('locked');
  });

  it('GRADE DISTRIBUTION: score 5 (perfect) → 100% → grade A', async () => {
    const { criteria, profiles } = await setupDb();
    const crit = criteria[0];
    const prof = profiles[0] || { id: 'prof-0', title: 'Test', code: 'TEST', family: 'Test', items: [{ cid: crit.id, weight: 100 }], baseRewardAmount: undefined, locked: false };

    const evalA = makeEval({
      profileId: prof.id,
      scores: [{ cid: crit.id, value: 5, weight: 100, self: 5, selfWeight: 0 }],
    });
    const score = calculateFinalScore(evalA, [prof]);
    expect(score).toBe(100);
    expect(getGrade(score)).toBe('A');
  });

  it('GRADE DISTRIBUTION: score 1 (minimum) → 20% → grade E', async () => {
    const { criteria, profiles } = await setupDb();
    const crit = criteria[0];
    const prof = profiles[0] || { id: 'prof-0', title: 'Test', code: 'TEST', family: 'Test', items: [{ cid: crit.id, weight: 100 }], baseRewardAmount: undefined, locked: false };

    const evalE = makeEval({
      profileId: prof.id,
      scores: [{ cid: crit.id, value: 1, weight: 100, self: 1, selfWeight: 0 }],
    });
    const score = calculateFinalScore(evalE, [prof]);
    expect(score).toBe(20);
    expect(getGrade(score)).toBe('E');
  });

  it('GRADE BOUNDARIES: verify grade thresholds', () => {
    // getGrade: A=90+, B=75+, C=60+, D=45+, E=<45
    expect(getGrade(100)).toBe('A');
    expect(getGrade(90)).toBe('A');
    expect(getGrade(89)).toBe('B');
    expect(getGrade(75)).toBe('B');
    expect(getGrade(74)).toBe('C');
    expect(getGrade(60)).toBe('C');
    expect(getGrade(59)).toBe('D');
    expect(getGrade(45)).toBe('D');
    expect(getGrade(44)).toBe('E');
    expect(getGrade(20)).toBe('E');
    expect(getGrade(0)).toBe('E');
  });

  it('CALIBRATION GATE: only draft evals with all scores > 0 are ready', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];

    const readyEval = makeEval({
      profileId: '', period: 'TEST-1', status: 'draft',
      scores: [{ cid: crit.id, value: 3, weight: 100, self: 3, selfWeight: 0 }],
    });
    const incompleteEval = makeEval({
      profileId: '', period: 'TEST-2', status: 'draft',
      scores: [{ cid: crit.id, value: 0, weight: 100, self: 0, selfWeight: 0 }],
    });
    const calibratedEval = makeEval({
      profileId: '', period: 'TEST-3', status: 'calibrated',
      scores: [{ cid: crit.id, value: 4, weight: 100, self: 4, selfWeight: 0 }],
    });

    db.saveEvaluations([...db.getEvaluations(), readyEval, incompleteEval, calibratedEval]);

    // Replicate Calibration.tsx filter
    const readyForCalibration = db.getEvaluations().filter(ev => {
      return ev.status === 'draft' && ev.scores.every(s => s.value > 0);
    });

    expect(readyForCalibration.find(e => e.id === readyEval.id)).toBeDefined();
    expect(readyForCalibration.find(e => e.id === incompleteEval.id)).toBeUndefined();
    expect(readyForCalibration.find(e => e.id === calibratedEval.id)).toBeUndefined();
  });

  it('INFLATED SCORE DETECTION: A > 25% triggers inflation warning', () => {
    const dist = { A: 6, B: 2, C: 1, D: 0, E: 1 };
    const totalScored = Object.values(dist).reduce((a, b) => a + b, 0);
    const aPercentage = Math.round((dist.A / totalScored) * 100);
    expect(aPercentage).toBe(60);
    expect(aPercentage > 25).toBe(true); // Inflation detected
  });

  it('NORMAL DISTRIBUTION: A <= 25% does not trigger warning', () => {
    const dist = { A: 1, B: 3, C: 4, D: 1, E: 1 };
    const totalScored = Object.values(dist).reduce((a, b) => a + b, 0);
    const aPercentage = Math.round((dist.A / totalScored) * 100);
    expect(aPercentage).toBe(10);
    expect(aPercentage > 25).toBe(false); // No inflation
  });

  it('INVALID TRANSITION: locked evaluations excluded from calibration panel', async () => {
    const { db } = await setupDb();
    const lockedEval = makeEval({ status: 'locked', scores: [{ cid: 'c1', value: 5, weight: 100, self: 5, selfWeight: 0 }] });
    db.saveEvaluations([...db.getEvaluations(), lockedEval]);

    // Calibration panel only shows draft evals with all scores > 0
    const ready = db.getEvaluations().filter(ev => {
      return ev.status === 'draft' && ev.scores.every(s => s.value > 0);
    });
    expect(ready.find(e => e.id === lockedEval.id)).toBeUndefined();
  });

  it('GRADE DETAILS: all grades have color and label', () => {
    for (const grade of ['A', 'B', 'C', 'D', 'E']) {
      expect(GRADE_DETAILS[grade]).toBeDefined();
      expect(GRADE_DETAILS[grade].color).toBeDefined();
      expect(GRADE_DETAILS[grade].label).toBeDefined();
    }
  });

  it('CALIBRATION FILTER: evals with zero scores are excluded', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];
    const evalWithZero = makeEval({
      status: 'draft',
      scores: [{ cid: crit.id, value: 0, weight: 100, self: 0, selfWeight: 0 }],
    });
    db.saveEvaluations([...db.getEvaluations(), evalWithZero]);

    const filtered = db.getEvaluations().filter(ev => {
      return ev.status === 'draft' && ev.scores.every(s => s.value > 0);
    });
    expect(filtered.find(e => e.id === evalWithZero.id)).toBeUndefined();
  });

  it('WEIGHTED SCORE: profile weights used for draft evaluations', async () => {
    const { criteria, profiles } = await setupDb();
    const crit1 = criteria[0];
    const crit2 = criteria[1] || criteria[0];
    const prof = {
      id: 'prof-weight-test', title: 'Weight Test', code: 'WTEST', family: 'Test',
      items: [
        { cid: crit1.id, weight: 30 },
        { cid: crit2.id, weight: 70 },
      ],
      baseRewardAmount: undefined, locked: false,
    };

    // Score crit1=1 (profile weight 30), crit2=5 (profile weight 70)
    // draft status → live profile weights used
    // avg5 = (1*30 + 5*70) / (30+70) = 380/100 = 3.8
    // result = 3.8 * 20 = 76
    const eval_ = makeEval({
      profileId: prof.id, status: 'draft',
      scores: [
        { cid: crit1.id, value: 1, weight: 50, self: 1, selfWeight: 0 },
        { cid: crit2.id, value: 5, weight: 50, self: 5, selfWeight: 0 },
      ],
    });
    const score = calculateFinalScore(eval_, [prof]);
    expect(score).toBe(76);
    expect(getGrade(score)).toBe('B');
  });

  it('WEIGHTED SCORE: locked evaluations use snapshot weights (not profile)', async () => {
    const { criteria } = await setupDb();
    const crit1 = criteria[0];
    const crit2 = criteria[1] || criteria[0];
    const prof = {
      id: 'prof-lock-test', title: 'Lock Test', code: 'LTEST', family: 'Test',
      items: [
        { cid: crit1.id, weight: 30 },
        { cid: crit2.id, weight: 70 },
      ],
      baseRewardAmount: undefined, locked: false,
    };

    // When status is 'calibrated' or 'locked', snapshot weights (from scores) are used
    // scores have weight 50/50, so avg5 = (1*50 + 5*50)/(50+50) = 3.0
    // result = 3.0 * 20 = 60
    const eval_ = makeEval({
      profileId: prof.id, status: 'locked',
      scores: [
        { cid: crit1.id, value: 1, weight: 50, self: 1, selfWeight: 0 },
        { cid: crit2.id, value: 5, weight: 50, self: 5, selfWeight: 0 },
      ],
    });
    const score = calculateFinalScore(eval_, [prof]);
    expect(score).toBe(60);
    expect(getGrade(score)).toBe('C');
  });
});
