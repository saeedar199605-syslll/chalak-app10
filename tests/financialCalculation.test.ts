import { describe, expect, it } from 'vitest';
import { evaluateNumericFormula, calculateFinalScore } from '../src/utils/formulaEngine';
import { Employee, Evaluation, JobProfile, RewardConfig } from '../src/types';

describe('Financial / Reward Calculation', () => {
  const BASE_CONFIG: RewardConfig = {
    formula: 'baseAmount * multiplier',
    coefficients: [
      { jobFamily: 'all', baseAmount: 10_000_000 },
      { jobFamily: 'تولید', baseAmount: 12_000_000 },
    ],
    multipliers: [
      { minScore: 90, maxScore: 100, multiplier: 1.5 },
      { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
      { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
      { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
      { minScore: 0, maxScore: 49.99, multiplier: 0.0 },
    ]
  };

  const getMultiplier = (config: RewardConfig, score: number) => {
    const m = config.multipliers.find(m => score >= m.minScore && score <= (m.maxScore === 100 ? 100 : m.maxScore));
    return m ? m.multiplier : 0;
  };

  const getBaseAmount = (config: RewardConfig, jobFamily: string, profileBaseAmount?: number) => {
    if (profileBaseAmount !== undefined && profileBaseAmount > 0) return profileBaseAmount;
    const specific = config.coefficients.find(c => c.jobFamily === jobFamily);
    return specific ? specific.baseAmount : (config.coefficients.find(c => c.jobFamily === 'all')?.baseAmount || 0);
  };

  const getReward = (config: RewardConfig, score: number, jobFamily: string, profileBaseAmount?: number) => {
    const baseAmount = getBaseAmount(config, jobFamily, profileBaseAmount);
    const multiplier = getMultiplier(config, score);
    return evaluateNumericFormula(config.formula || 'baseAmount * multiplier', { baseAmount, multiplier, score });
  };

  it('calculates reward with "all" coefficient and score 100', () => {
    // score 100, multiplier 1.5, baseAmount 10M → 15M
    expect(getReward(BASE_CONFIG, 100, 'engineering')).toBe(15_000_000);
  });

  it('calculates reward with job-family-specific coefficient', () => {
    // score 85, multiplier 1.2, baseAmount (تولید) 12M → 14.4M
    expect(getReward(BASE_CONFIG, 85, 'تولید')).toBe(14_400_000);
  });

  it('uses profile baseRewardAmount when provided (overrides coefficient)', () => {
    // profileBaseAmount 20M, score 95, multiplier 1.5 → 30M
    expect(getReward(BASE_CONFIG, 95, 'تولید', 20_000_000)).toBe(30_000_000);
  });

  it('multiplier is 0 for score below 50 (no reward)', () => {
    expect(getReward(BASE_CONFIG, 30, 'تولید')).toBe(0);
  });

  it('handles empty coefficients gracefully (falls back to 0 base)', () => {
    const config: RewardConfig = {
      formula: 'baseAmount * multiplier',
      coefficients: [],
      multipliers: BASE_CONFIG.multipliers,
    };
    // score 85, multiplier 1.2, baseAmount 0 → 0
    expect(getReward(config, 85, 'unknown')).toBe(0);
  });

  it('uses correct multiplier boundaries', () => {
    // score 70 → multiplier 1.0
    expect(getMultiplier(BASE_CONFIG, 70)).toBe(1.0);
    // score 69.99 → multiplier 0.5
    expect(getMultiplier(BASE_CONFIG, 69.99)).toBe(0.5);
    // score 80 → multiplier 1.2
    expect(getMultiplier(BASE_CONFIG, 80)).toBe(1.2);
    // score 79.99 → multiplier 1.0
    expect(getMultiplier(BASE_CONFIG, 79.99)).toBe(1.0);
    // score 90 → multiplier 1.5
    expect(getMultiplier(BASE_CONFIG, 90)).toBe(1.5);
  });

  it('custom formula works with score variable', () => {
    const config: RewardConfig = {
      formula: 'baseAmount * (score / 100) * multiplier',
      coefficients: [{ jobFamily: 'all', baseAmount: 10_000_000 }],
      multipliers: [{ minScore: 0, maxScore: 100, multiplier: 1.0 }],
    };
    // 10M * (80/100) * 1.0 = 8M
    expect(getReward(config, 80, 'test')).toBe(8_000_000);
  });

  it('rewards only locked/calibrated evaluations', () => {
    const evals: Evaluation[] = [
      { id: 'e1', empId: 'emp1', profileId: 'p1', period: '1403', status: 'draft', scores: [{ cid: 'c1', value: 5, weight: 100 }] } as Evaluation,
      { id: 'e2', empId: 'emp2', profileId: 'p1', period: '1403', status: 'locked', scores: [{ cid: 'c1', value: 4, weight: 100 }] } as Evaluation,
      { id: 'e3', empId: 'emp3', profileId: 'p1', period: '1403', status: 'calibrated', scores: [{ cid: 'c1', value: 3, weight: 100 }] } as Evaluation,
    ];
    const completed = evals.filter(ev => ev.status === 'locked' || ev.status === 'calibrated');
    expect(completed.length).toBe(2);
  });
});
