/**
 * Regression tests for Overdue Notifications fabricating fake days (Issue: SLA).
 *
 * Root cause: The getOverdueEvaluations function used a character-code hash
 * of the evaluation ID to generate pseudo-random daysPending, plus a hardcoded
 * special case for "eval-reza-1" to fabricate unrealistic overdue items.
 * This presented fabricated analytics as real data.
 *
 * Fix: daysPending is now calculated from actual timestamps in evaluation
 * history (or the evaluation's creation time). No character-code hashing,
 * no hardcoded special cases, no fabricated days.
 */
import { describe, expect, it } from 'vitest';
import { getOverdueEvaluations } from '../src/utils/overdueNotifications';
import { Evaluation, Employee } from '../src/types';

describe('Overdue Notifications — No Fabricated Days (SLA)', () => {
  const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
    id: 'emp-1',
    name: 'تست کارمند',
    code: 'TEST-001',
    profileId: 'prof-1',
    unit: 'تست',
    role: 'employee',
    username: 'test.user',
    ...overrides,
  });

  const makeEval = (overrides: Partial<Evaluation> = {}): Evaluation => ({
    id: 'eval-test-1',
    empId: 'emp-1',
    profileId: 'prof-1',
    period: 'بهار ۱۴۰۵',
    status: 'draft',
    scores: [],
    created: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    ...overrides,
  });

  it('does not fabricate daysPending from evaluation ID character codes', () => {
    // The old code used Math.abs(ev.id.split('').reduce(...)) to generate
    // pseudo-random days. Verify two different evaluations with same timestamps
    // produce the same daysPending regardless of ID hash.
    const evalA = makeEval({ id: 'eval-aaa', created: Date.now() - 6 * 24 * 60 * 60 * 1000 });
    const evalB = makeEval({ id: 'eval-zzz', created: Date.now() - 6 * 24 * 60 * 60 * 1000 });

    const emp = makeEmployee();
    const admin = makeEmployee({ id: 'admin-1', role: 'admin' });

    const overdueA = getOverdueEvaluations([evalA], [emp], admin);
    const overdueB = getOverdueEvaluations([evalB], [emp], admin);

    // self_review SLA is 4 days, 6 days pending → overdue
    expect(overdueA.length).toBe(1);
    expect(overdueB.length).toBe(1);
    // Both should show the same daysPending (6) since timestamps are identical
    expect(overdueA[0].daysPending).toBe(overdueB[0].daysPending);
    expect(overdueA[0].daysPending).toBe(6);
  });

  it('uses actual timestamp from history to calculate daysPending', () => {
    // Create an evaluation that entered supervisor_review 6 days ago
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const ev = makeEval({
      stage: 'supervisor_review',
      status: 'draft',
      history: [{
        id: 'hist-1',
        fromStage: 'self_review',
        toStage: 'supervisor_review',
        actorId: 'admin',
        actorName: 'Admin',
        actorRole: 'admin',
        action: 'advance',
        timestamp: sixDaysAgo,
      }],
      created: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdue = getOverdueEvaluations([ev], [emp], admin);
    // supervisor_review SLA is 3 days, 6 days pending → overdue
    expect(overdue.length).toBe(1);
    expect(overdue[0].daysPending).toBe(6);
    expect(overdue[0].maxAllowedDays).toBe(3);
    expect(overdue[0].daysOverdue).toBe(3);
  });

  it('uses created timestamp as fallback when no history exists', () => {
    // No history — should use created timestamp
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const ev = makeEval({
      created: tenDaysAgo,
      stage: 'self_review',
      status: 'draft',
      history: [],
    });

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdue = getOverdueEvaluations([ev], [emp], admin);
    // self_review SLA is 4 days, 10 days pending → overdue
    expect(overdue.length).toBe(1);
    expect(overdue[0].daysPending).toBe(10);
  });

  it('does not mark completed evaluations as overdue', () => {
    const ev = makeEval({
      stage: 'completed',
      status: 'locked',
      created: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
    });

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdue = getOverdueEvaluations([ev], [emp], admin);
    expect(overdue.length).toBe(0);
  });

  it('does not mark evaluations within SLA as overdue', () => {
    // self_review SLA is 4 days, created 2 days ago → not overdue
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const ev = makeEval({
      created: twoDaysAgo,
      stage: 'self_review',
      status: 'draft',
    });

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdue = getOverdueEvaluations([ev], [emp], admin);
    expect(overdue.length).toBe(0);
  });

  it('no hardcoded special case for specific evaluation IDs', () => {
    // The old code had: if (ev.id === 'eval-reza-1') { daysPending = 6; }
    // Verify that an eval with this ID behaves the same as any other
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const evWithOldSpecialId = makeEval({
      id: 'eval-reza-1',
      created: sevenDaysAgo,
      stage: 'self_review',
      status: 'draft',
    });
    const evWithNormalId = makeEval({
      id: 'eval-normal-1',
      created: sevenDaysAgo,
      stage: 'self_review',
      status: 'draft',
    });

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdueSpecial = getOverdueEvaluations([evWithOldSpecialId], [emp], admin);
    const overdueNormal = getOverdueEvaluations([evWithNormalId], [emp], admin);

    // Both should have the same daysPending since timestamps are identical
    expect(overdueSpecial.length).toBe(1);
    expect(overdueNormal.length).toBe(1);
    expect(overdueSpecial[0].daysPending).toBe(overdueNormal[0].daysPending);
    expect(overdueSpecial[0].daysPending).toBe(7);
  });

  it('returns 0 daysPending when no timestamp available', () => {
    const ev = makeEval({
      created: 0, // falsy timestamp
      history: [],
    });
    // Remove created to simulate missing timestamp
    delete (ev as any).created;

    const emp = makeEmployee();
    const admin = makeEmployee({ role: 'admin' });

    const overdue = getOverdueEvaluations([ev], [emp], admin);
    // 0 days pending → never overdue
    expect(overdue.length).toBe(0);
  });
});
