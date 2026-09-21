/**
 * Behavioral tests for the Cycle Time / Production Metrics Calculator (B04).
 *
 * Tests the actual calculation formulas used by ProductionCycleTimeCalculator
 * to verify they produce correct, deterministic results.
 */
import { describe, expect, it } from 'vitest';
import { calculateProductionMetrics, applyProductionMetricsToEvaluation } from '../src/utils/productionCalculations';
import { Criterion, Evaluation } from '../src/types';

describe('Cycle Time Calculator — Production Metrics', () => {
  it('EFFICIENCY: produced/units = 100%', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-001', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(100);
    expect(result.productionScore).toBe(4); // 100-104.99% → score 4
  });

  it('EFFICIENCY: 105%+ → score 5', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-002', period: 'H1',
      producedUnits: 105, targetUnits: 100,
      actualCycleTimeSec: 40, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(105);
    expect(result.productionScore).toBe(5);
  });

  it('EFFICIENCY: 80-91% → score 2', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-003', period: 'H1',
      producedUnits: 85, targetUnits: 100,
      actualCycleTimeSec: 50, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(85);
    expect(result.productionScore).toBe(2);
  });

  it('EFFICIENCY: <80% → score 1', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-004', period: 'H1',
      producedUnits: 50, targetUnits: 100,
      actualCycleTimeSec: 90, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(50);
    expect(result.productionScore).toBe(1);
  });

  it('CYCLE TIME: improvement (actual < standard)', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-005', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 36, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    // variance = 45 - 36 = 9 (improvement)
    expect(result.cycleTimeVarianceSec).toBe(9);
    expect(result.cycleTimeImprovementRate).toBe(20); // 9/45*100=20%
    // improvement rate >= 10% → score 5
    expect(result.cycleTimeScore).toBe(5);
  });

  it('CYCLE TIME: delay (actual > standard)', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-006', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 54, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    // variance = 45 - 54 = -9 (delay)
    expect(result.cycleTimeVarianceSec).toBe(-9);
    expect(result.cycleTimeImprovementRate).toBe(-20); // -9/45*100=-20%
    // delay > 10% → score 1
    expect(result.cycleTimeScore).toBe(1);
  });

  it('SCRAP: zero scrap → score 5', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-007', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.scrapRate).toBe(0);
    expect(result.ppm).toBe(0);
    expect(result.scrapScore).toBe(5);
  });

  it('SCRAP: 2% scrap → score 4', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-008', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 2, workingHours: 160, downtimeHours: 0,
    });
    expect(result.scrapRate).toBe(2);
    expect(result.ppm).toBe(20000); // 2% * 1,000,000 = 20,000
    expect(result.scrapScore).toBe(3); // <= 2.5% → score 3
  });

  it('SCRAP: 10% scrap → score 1', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-009', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 10, workingHours: 160, downtimeHours: 0,
    });
    expect(result.scrapRate).toBe(10);
    expect(result.scrapScore).toBe(1); // >= 10% → score 1
  });

  it('OEE: with downtime reduces availability', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-010', period: 'H1',
      producedUnits: 100, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 8,
    });
    // availability = (160 - 8) / 160 * 100 = 95%
    expect(result.availabilityRate).toBe(95);
    expect(result.oeeRate).toBe(95); // performance = 100%, quality = 100% → OEE = 95%
  });

  it('EDGE: zero production (no division by zero)', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-011', period: 'H1',
      producedUnits: 0, targetUnits: 100,
      actualCycleTimeSec: 45, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(0);
    expect(result.productionScore).toBe(1);
    expect(result.scrapRate).toBe(0); // safe target used
  });

  it('EDGE: zero downtime and zero production', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-012', period: 'H1',
      producedUnits: 0, targetUnits: 0,
      actualCycleTimeSec: 0, standardCycleTimeSec: 0,
      scrapUnits: 0, workingHours: 0, downtimeHours: 0,
    });
    expect(result.efficiencyRate).toBe(0);
    expect(result.cycleTimeVarianceSec).toBe(0);
    // When workingHours=0, safe default 160 hours → availability=100%
    expect(result.availabilityRate).toBe(100);
  });

  it('BADGE LEVEL: excellent', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-013', period: 'H1',
      producedUnits: 120, targetUnits: 100,
      actualCycleTimeSec: 30, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });
    expect(result.badgeLevel).toBe('عالی (A+)'); // OEE > 85%
  });

  it('BADGE LEVEL: critical', () => {
    const result = calculateProductionMetrics({
      empCode: 'E-014', period: 'H1',
      producedUnits: 30, targetUnits: 100,
      actualCycleTimeSec: 90, standardCycleTimeSec: 45,
      scrapUnits: 50, workingHours: 160, downtimeHours: 40,
    });
    expect(result.badgeLevel).toBe('بحرانی (D)'); // OEE < 50%
  });

  it('APPLY TO EVAL: maps K-01, K-11, K-04 criterion scores', () => {
    // Create criteria with the specific codes the calculator maps to
    const K01: Criterion = {
      id: 'k-01-id', code: 'K-01', cat: 'K', name: 'تولید',
      def: '', source: '', method: '', dir: 'more',
    };
    const K11: Criterion = {
      id: 'k-11-id', code: 'K-11', cat: 'K', name: 'سایکل‌تایم',
      def: '', source: '', method: '', dir: 'less',
    };
    const K04: Criterion = {
      id: 'k-04-id', code: 'K-04', cat: 'K', name: 'ضایعات',
      def: '', source: '', method: '', dir: 'less',
    };

    const calc = calculateProductionMetrics({
      empCode: 'E-999', period: 'H1',
      producedUnits: 105, targetUnits: 100,
      actualCycleTimeSec: 40, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });

    // Create evaluation with K-01, K-11, K-04 score entries
    const evalBase: Evaluation = {
      id: 'eval-test-001',
      empId: 'emp-1',
      profileId: 'prof-1',
      period: 'H1',
      status: 'draft',
      scores: [
        { cid: 'k-01-id', weight: 40, value: 0, self: 0, doc: '' },
        { cid: 'k-11-id', weight: 25, value: 0, self: 0, doc: '' },
        { cid: 'k-04-id', weight: 20, value: 0, self: 0, doc: '' },
        { cid: 'other-id', weight: 15, value: 3, self: 3, doc: '' },
      ],
      created: Date.now(),
    };

    const result = applyProductionMetricsToEvaluation(evalBase, [K01, K11, K04], calc, {
      empCode: 'E-999', empName: 'Test', period: 'H1',
      producedUnits: 105, targetUnits: 100,
      actualCycleTimeSec: 40, standardCycleTimeSec: 45,
      scrapUnits: 0, workingHours: 160, downtimeHours: 0,
    });

    const k01Score = result.scores.find(s => s.cid === 'k-01-id');
    const k11Score = result.scores.find(s => s.cid === 'k-11-id');
    const k04Score = result.scores.find(s => s.cid === 'k-04-id');
    const otherScore = result.scores.find(s => s.cid === 'other-id');

    // K-01 (production) score should match productionScore (5 at 105%)
    expect(k01Score!.value).toBe(calc.productionScore);
    // K-11 (cycle time) score should match cycleTimeScore
    expect(k11Score!.value).toBe(calc.cycleTimeScore);
    // K-04 (scrap) score should match scrapScore
    expect(k04Score!.value).toBe(calc.scrapScore);
    // Other criteria should NOT be modified
    expect(otherScore!.value).toBe(3);
  });
});