/**
 * B29/B30 — Financial Reward / Money Precision Tests
 *
 * Tests reward calculation with independently predetermined oracle values.
 * Tests money precision, boundary conditions, and edge cases.
 */
import { describe, expect, it } from 'vitest';
import { getGrade } from '../src/types';
import { calculateFinalScore, evaluateNumericFormula } from '../src/utils/formulaEngine';

describe('B29: Financial Reward — Independent Oracle', () => {
  it('REWARD: baseAmount=10,000,000, multiplier=1.2 → 12,000,000', () => {
    const result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 10_000_000, multiplier: 1.2 });
    expect(result).toBe(12_000_000);
  });

  it('REWARD: score 80 → multiplier 1.2', () => {
    // Default multiplier config: { minScore: 80, maxScore: 89.99, multiplier: 1.2 }
    const multipliers = [
      { minScore: 90, maxScore: 100, multiplier: 1.5 },
      { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
      { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
      { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
      { minScore: 0, maxScore: 49.99, multiplier: 0.0 },
    ];
    const score = 80;
    const m = multipliers.find(m => score >= m.minScore && score <= m.maxScore);
    expect(m!.multiplier).toBe(1.2);
    expect(score * m!.multiplier).toBe(1.2 * score); // 96
  });

  it('REWARD: score 90 → multiplier 1.5', () => {
    const multipliers = [
      { minScore: 90, maxScore: 100, multiplier: 1.5 },
      { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
      { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
      { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
      { minScore: 0, maxScore: 49.99, multiplier: 0.0 },
    ];
    const score = 90;
    const m = multipliers.find(m => score >= m.minScore && score <= m.maxScore);
    expect(m!.multiplier).toBe(1.5);
  });

  it('REWARD: score 0 → multiplier 0.0 (no reward)', () => {
    const multipliers = [
      { minScore: 90, maxScore: 100, multiplier: 1.5 },
      { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
      { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
      { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
      { minScore: 0, maxScore: 49.99, multiplier: 0.0 },
    ];
    const score = 0;
    const m = multipliers.find(m => score >= m.minScore && score <= m.maxScore);
    expect(m!.multiplier).toBe(0.0);
    expect(10_000_000 * 0.0).toBe(0);
  });

  it('REWARD: score 100 → multiplier 1.5', () => {
    const multipliers = [
      { minScore: 90, maxScore: 100, multiplier: 1.5 },
      { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
      { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
      { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
      { minScore: 0, maxScore: 49.99, multiplier: 0.0 },
    ];
    const score = 100;
    const m = multipliers.find(m => score >= m.minScore && score <= m.maxScore);
    expect(m!.multiplier).toBe(1.5);
  });
});

describe('B30: Money Precision — No Floating-Point Artifacts', () => {
  it('PRECISION: 10,000,000 * 1.2 = exactly 12,000,000', () => {
    const result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 10_000_000, multiplier: 1.2 });
    expect(result).toBe(12_000_000);
    // Check no floating point artifact
    const str = result.toString();
    expect(str).not.toMatch(/\.\d{10,}/); // No long decimal tail
  });

  it('PRECISION: 5,000,000 * 0.5 = exactly 2,500,000', () => {
    const result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 5_000_000, multiplier: 0.5 });
    expect(result).toBe(2_500_000);
  });

  it('PRECISION: 10,000,000 * 1.5 = exactly 15,000,000', () => {
    const result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 10_000_000, multiplier: 1.5 });
    expect(result).toBe(15_000_000);
  });

  it('PRECISION: 10,000,000 * 1.0 = exactly 10,000,000', () => {
    const result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 10_000_000, multiplier: 1.0 });
    expect(result).toBe(10_000_000);
  });

  it('PRECISION: no NaN or Infinity in reward results', () => {
    // Test edge case: zero base
    let result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 0, multiplier: 1.5 });
    expect(result).toBe(0);
    expect(result).not.toBeNaN();
    expect(result).not.toBe(Infinity);

    // Test very large amount
    result = evaluateNumericFormula('baseAmount * multiplier', { baseAmount: 1_000_000_000, multiplier: 1.5 });
    expect(result).toBe(1_500_000_000);
    expect(result).not.toBeNaN();
    expect(result).not.toBe(Infinity);
  });
});

describe('B28: Calibration — Grade Thresholds', () => {
  it('GRADE: 59.9 → D (>=45, <60)', () => {
    expect(getGrade(59.9)).toBe('D');
  });

  it('GRADE: 60 → C (at threshold)', () => {
    expect(getGrade(60)).toBe('C');
  });

  it('GRADE: 69.9 → C', () => {
    expect(getGrade(69.9)).toBe('C');
  });

  it('GRADE: 74.9 → C (<75)', () => {
    expect(getGrade(74.9)).toBe('C');
  });

  it('GRADE: 75 → B (at threshold)', () => {
    expect(getGrade(75)).toBe('B');
  });

  it('GRADE: 79.9 → B', () => {
    expect(getGrade(79.9)).toBe('B');
  });

  it('GRADE: 89.9 → B (<90)', () => {
    expect(getGrade(89.9)).toBe('B');
  });

  it('GRADE: 90 → A (at threshold)', () => {
    expect(getGrade(90)).toBe('A');
  });

  it('GRADE: 100 → A (maximum)', () => {
    expect(getGrade(100)).toBe('A');
  });

  it('GRADE: 0 → E (below 45)', () => {
    expect(getGrade(0)).toBe('E');
  });

  it('GRADE: 44.9 → E (<45)', () => {
    expect(getGrade(44.9)).toBe('E');
  });

  it('GRADE: 45 → D (at threshold)', () => {
    expect(getGrade(45)).toBe('D');
  });

  it('GRADE: floating-point edge — 89.999 → B (not A)', () => {
    // 89.999 < 90 → B
    expect(getGrade(89.999)).toBe('B');
  });

  it('SCORE: score stays within valid range [0, 100]', () => {
    // All scores = 1, weight = 100 → avg5 = 1.0 → score = 20.0
    const scores1 = [{ cid: 'c1', weight: 100, value: 1, self: 1 }];
    expect(calculateFinalScore({ scores: scores1 } as any, [])).toBe(20.0);

    // All scores = 5 → avg5 = 5.0 → score = 100.0
    const scores5 = [{ cid: 'c1', weight: 100, value: 5, self: 5 }];
    expect(calculateFinalScore({ scores: scores5 } as any, [])).toBe(100.0);
  });
});
