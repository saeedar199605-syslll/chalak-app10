import { describe, expect, it } from 'vitest';
import { calculateFinalScore, SCALE_FACTOR } from '../src/utils/formulaEngine';
import { Evaluation, JobProfile } from '../src/types';

describe('calculateFinalScore', () => {
  it('returns 0 for evaluation with no scores', () => {
    const ev: Evaluation = { scores: [], profileId: 'prof-1', period: '۱۴۰۳/۰۱', status: 'draft' } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(0);
  });

  it('returns 0 for evaluation with no scored items (all zeros)', () => {
    const ev: Evaluation = {
      scores: [{ cid: 'c1', value: 0, weight: 50 }, { cid: 'c2', value: 0, weight: 50 }],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(0);
  });

  it('calculates weighted average correctly', () => {
    // Score: (3*50 + 5*50) / 100 = 4.0 on 5-point scale
    // Final: 4.0 * 20 = 80.0
    const ev: Evaluation = {
      scores: [{ cid: 'c1', value: 3, weight: 50 }, { cid: 'c2', value: 5, weight: 50 }],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(80);
  });

  it('handles equal weights with mixed scores', () => {
    // Scores: 1, 2, 3, 4, 5 each weight 20, total weight 100
    // avg = (1+2+3+4+5)/5 = 3.0
    // final = 3.0 * 20 = 60.0
    const ev: Evaluation = {
      scores: [
        { cid: 'c1', value: 1, weight: 20 },
        { cid: 'c2', value: 2, weight: 20 },
        { cid: 'c3', value: 3, weight: 20 },
        { cid: 'c4', value: 4, weight: 20 },
        { cid: 'c5', value: 5, weight: 20 },
      ],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(60);
  });

  it('all 5s with equal weights gives 100', () => {
    const ev: Evaluation = {
      scores: [
        { cid: 'c1', value: 5, weight: 50 },
        { cid: 'c2', value: 5, weight: 50 },
      ],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(100);
  });

  it('all 1s with equal weights gives 20', () => {
    const ev: Evaluation = {
      scores: [
        { cid: 'c1', value: 1, weight: 50 },
        { cid: 'c2', value: 1, weight: 50 },
      ],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev)).toBe(20);
  });

  it('uses live profile weights for draft evaluations', () => {
    // Snapshot weights: 50/50, scores 3/5 → avg 4 → 80
    // Live profile weights: 70/30 → (3*70 + 5*30)/100 = 3.6 → 72
    const profiles: JobProfile[] = [{
      id: 'prof-1',
      title: 'Test',
      code: 'T-01',
      family: 'Test',
      items: [
        { cid: 'c1', weight: 70 },
        { cid: 'c2', weight: 30 },
      ]
    } as JobProfile];
    const ev: Evaluation = {
      scores: [
        { cid: 'c1', value: 3, weight: 50 },
        { cid: 'c2', value: 5, weight: 50 },
      ],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    expect(calculateFinalScore(ev, profiles)).toBe(72);
  });

  it('uses snapshot weights for non-draft (calibrated/locked) evaluations', () => {
    // Snapshot weights: 50/50, scores 3/5 → avg 4 → 80
    // Live profile weights: 70/30 → would give 72
    // But since status is 'calibrated', snapshot weights should be used
    const profiles: JobProfile[] = [{
      id: 'prof-1',
      title: 'Test',
      code: 'T-01',
      family: 'Test',
      items: [
        { cid: 'c1', weight: 70 },
        { cid: 'c2', weight: 30 },
      ]
    } as JobProfile];
    const ev: Evaluation = {
      scores: [
        { cid: 'c1', value: 3, weight: 50 },
        { cid: 'c2', value: 5, weight: 50 },
      ],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'calibrated'
    } as Evaluation;
    expect(calculateFinalScore(ev, profiles)).toBe(80);
  });

  it('handles single criterion at 100 weight', () => {
    const ev: Evaluation = {
      scores: [{ cid: 'c1', value: 4, weight: 100 }],
      profileId: 'prof-1',
      period: '۱۴۰۳/۰۱',
      status: 'draft'
    } as Evaluation;
    // avg = 4, final = 4 * 20 = 80
    expect(calculateFinalScore(ev)).toBe(80);
  });

  it('handles null/undefined input gracefully', () => {
    expect(calculateFinalScore(null as any)).toBe(0);
    expect(calculateFinalScore({} as Evaluation)).toBe(0);
  });
});
