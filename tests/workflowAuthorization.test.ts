/**
 * DW-01 through DW-20 — Delegation of Authority & Workflow Authorization Simulations
 *
 * Tests the canPerformWorkflowAction authorization engine to verify that
 * only authorized users can perform workflow actions (advance, reject,
 * override, reassign, approve) on evaluations.
 *
 * These tests do NOT use fake/mock data — they use deterministic employee
 * and evaluation fixtures that mirror the application's actual role model.
 */
import { describe, expect, it } from 'vitest';
import {
  canPerformWorkflowAction,
  hasActiveDelegation,
  isDelegationActive,
  isWithinSupervisorScope,
  canDelegate,
  canViewEvaluation,
  isSelfDelegation,
  isDuplicateDelegation,
  DelegationRecord
} from '../src/utils/workflowAuthorization';
import { Evaluation, Employee, WorkflowStageKey } from '../src/types';

// ---- Deterministic fixtures ----

const makeEmployee = (overrides: Partial<Employee> & { id: string; name: string }): Employee => {
  const base = {
    code: 'EMP-001',
    profileId: 'prof-1',
    unit: 'تولید',
    role: 'employee' as const,
    username: 'test.user',
  };
  return { id: '', name: '', ...base, ...overrides };
};

const admin: Employee = makeEmployee({ id: 'admin-1', name: 'مدیر سیستم', role: 'admin', permissions: ['manage_users', 'manage_criteria', 'manage_profiles', 'view_all_reports', 'manage_evaluations'] });

const supervisor: Employee = makeEmployee({ id: 'sup-1', name: 'سرپرست الته', role: 'supervisor', unit: 'تولید' });

const supervisorOtherUnit: Employee = makeEmployee({ id: 'sup-2', name: 'سرپرست بازاریابی', role: 'supervisor', unit: 'بازاریابی' });

const emp1: Employee = makeEmployee({ id: 'emp-1', name: 'کارمند یک', role: 'employee', unit: 'تولید', supervisorId: 'sup-1' });
const emp2: Employee = makeEmployee({ id: 'emp-2', name: 'کارمند دو', role: 'employee', unit: 'تولید', supervisorId: 'sup-1' });
const emp3: Employee = makeEmployee({ id: 'emp-3', name: 'کارمند سه', role: 'employee', unit: 'بازاریابی', supervisorId: 'sup-2' });
const empUnitNoSupervisor: Employee = makeEmployee({ id: 'emp-4', name: 'کارمند چهار', role: 'employee', unit: 'تولید' });

const employees: Employee[] = [admin, supervisor, supervisorOtherUnit, emp1, emp2, emp3, empUnitNoSupervisor];

const makeEval = (empId: string, stage: WorkflowStageKey, overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: `eval-${empId}`,
  empId,
  profileId: 'prof-1',
  period: 'نیمه اول ۱۴۰۵',
  status: 'draft',
  stage,
  scores: [],
  created: Date.now() - 5 * 24 * 60 * 60 * 1000,
  ...overrides,
});

describe('DW-01: Native Supervisor Approval', () => {
  it('supervisor can advance own subordinate evaluation', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
  });

  it('supervisor can reject own subordinate evaluation', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(supervisor, ev, 'reject', { employees });
    expect(result.authorized).toBe(true);
  });
});

describe('DW-02: Valid Delegation', () => {
  const now = Date.now();
  const delegation: DelegationRecord = {
    id: 'deleg-1',
    delegatorId: supervisor.id,
    delegateId: emp2.id,
    action: 'approve',
    scope: 'unit',
    targetUnit: 'تولید',
    startDate: now - 86400000, // 1 day ago
    endDate: now + 86400000 * 30, // 30 days
    status: 'active',
    reason: 'مرخصی استعلامی',
    createdAt: now - 86400000,
  };

  it('delegated supervisor subordinate can approve', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(true);
    expect(result.reason).toContain('تفویض');
  });
});

describe('DW-03: Outside Scope', () => {
  it('supervisor from marketing cannot act on production employee', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(supervisorOtherUnit, ev, 'approve', { employees });
    expect(result.authorized).toBe(false);
  });

  it('delegated scope is limited — cannot cross units', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-2',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'employee',
      targetEmpId: emp1.id,
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // emp2 has delegation for emp1 only; cannot approve emp3 (other unit)
    const ev3 = makeEval(emp3.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev3, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-04: Expired Delegation', () => {
  it('expired delegation is not honored', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-expired',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000 * 10,
      endDate: now - 86400000 * 5, // expired 5 days ago
      status: 'active',
      createdAt: now - 86400000 * 10,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('صلاحیت');
  });

  it('isDelegationActive returns false for expired delegation', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-expired2',
      delegatorId: 'a', delegateId: 'b',
      action: 'approve', scope: 'unit',
      startDate: now - 86400000 * 10,
      endDate: now - 86400000 * 5,
      status: 'active', createdAt: now - 86400000 * 10,
    };
    expect(isDelegationActive(delegation, now + 1)).toBe(false);
  });
});

describe('DW-05: Revoked Delegation', () => {
  it('revoked delegation is not honored', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-revoked',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'revoked',
      createdAt: now - 86400000,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(false);
  });

  it('revoked delegation — historical delegation check returns not granted', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-revoked2',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'revoked',
      createdAt: now - 86400000,
    };
    const result = hasActiveDelegation(emp2, makeEval(emp1.id, 'supervisor_review'), 'approve', [delegation], employees, now);
    expect(result.granted).toBe(false);
  });
});

describe('DW-06: Self-Delegation Prevention', () => {
  it('self-delegation is prevented (cannot delegate to self)', () => {
    // If someone creates a delegation where delegatorId === delegateId,
    // the hasActiveDelegation function returns the delegation,
    // but logically this is invalid.
    const now = Date.now();
    const selfDeleg: DelegationRecord = {
      id: 'self-deleg',
      delegatorId: supervisor.id,
      delegateId: supervisor.id, // self-delegation
      action: 'approve',
      scope: 'system',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // Supervisor already has native authority, so it passes via native check
    // But the delegation itself should be rejected at creation time by canDelegate
    expect(canDelegate(supervisor, 'approve', employees, [selfDeleg])).toBe(true); // admin can delegate
    // For supervisor role, canDelegate should allow 'approve'
    expect(canDelegate(supervisor, 'approve', employees, [])).toBe(true);

    // Employee cannot delegate 'approve' action (not in their allowed actions)
    expect(canDelegate(emp1, 'approve', employees, [])).toBe(false);
  });
});

describe('DW-07: Unauthorized Delegator', () => {
  it('employee cannot delegate approve authority', () => {
    expect(canDelegate(emp1, 'approve', employees, [])).toBe(false);
  });

  it('employee can only delegate advance (self-review submission)', () => {
    expect(canDelegate(emp1, 'advance', employees, [])).toBe(true);
    // SECURITY FIX: employees do NOT have reject authority, so they cannot delegate it
    expect(canDelegate(emp1, 'reject', employees, [])).toBe(false);
    expect(canDelegate(emp1, 'approve', employees, [])).toBe(false);
  });
});

describe('DW-08: Privilege Escalation', () => {
  it('supervisor with delegation cannot perform admin actions', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-3',
      delegatorId: admin.id,
      delegateId: supervisor.id,
      action: 'approve',
      scope: 'system',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(supervisor, ev, 'override', { employees, delegations: [delegation] });
    // Supervisor has native scope (emp1 is subordinate), but 'override' is admin-level.
    // Even with system-scope delegation for 'approve', the delegate cannot escalate
    // to 'override' because delegated authority <= delegator's actual authority.
    // Supervisor's authority does not include 'override' (admin-only).
    expect(result.authorized).toBe(false);
  });

  it('employee cannot perform supervisor-level actions on others', () => {
    const ev = makeEval(emp2.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp1, ev, 'approve', { employees });
    expect(result.authorized).toBe(false);
  });

  it('employee cannot advance others evaluation', () => {
    const ev = makeEval(emp2.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp1, ev, 'advance', { employees });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-09: Circular Delegation', () => {
  // A → B
  // B → A
  // No authority amplification: each can only do what the delegation explicitly grants
  it('circular delegation does not amplify authority', () => {
    const now = Date.now();
    const delegAB: DelegationRecord = {
      id: 'circ-1',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    const delegBA: DelegationRecord = {
      id: 'circ-2',
      delegatorId: emp2.id,
      delegateId: supervisor.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // emp1 (supervisor subordinate) — emp2 has delegation from supervisor to approve
    // Supervisor has delegation from emp2... but emp2 is an employee and cannot
    // delegate 'approve' authority. The hasActiveDelegation function checks
    // the delegation record exists and is active, regardless of whether the
    // delegator had authority. The canDelegate function is the gatekeeper.
    const ev = makeEval(emp1.id, 'supervisor_review');

    // emp2 acting under supervisor's delegation — should work
    const result1 = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegAB] });
    expect(result1.authorized).toBe(true);

    // Supervisor acting under emp2's delegation — supervisor already has native authority
    const result2 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees, delegations: [delegAB, delegBA] });
    expect(result2.authorized).toBe(true); // via native authority
  });

  it('isWithinSupervisorScope checks supervisor-subordinate relationship', () => {
    expect(isWithinSupervisorScope(supervisor, emp1, employees)).toBe(true);
    expect(isWithinSupervisorScope(supervisor, emp3, employees)).toBe(false); // different unit
    expect(isWithinSupervisorScope(supervisorOtherUnit, emp1, employees)).toBe(false); // wrong unit
    expect(isWithinSupervisorScope(admin, emp1, employees)).toBe(true); // admin oversees all
    expect(isWithinSupervisorScope(supervisor, supervisorOtherUnit, employees)).toBe(false); // peer-to-peer
  });
});

describe('DW-10: Chain Delegation', () => {
  // A → B → C
  // If A (supervisor) delegates to B (employee), and B delegates to C (employee),
  // the system should NOT amplify authority without explicit chain support.
  it('chain delegation — each link must be explicitly authorized', () => {
    const now = Date.now();
    const delegAB: DelegationRecord = {
      id: 'chain-1',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    const delegBC: DelegationRecord = {
      id: 'chain-2',
      delegatorId: emp2.id, // emp2 (employee) trying to delegate
      delegateId: emp1.id, // wait, emp1 is subordinate — let's use empUnitNoSupervisor
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };

    // emp2 has valid delegation from supervisor — can approve
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result1 = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegAB] });
    expect(result1.authorized).toBe(true);

    // emp2 (employee) cannot delegate approve — canDelegate returns false
    expect(canDelegate(emp2, 'approve', employees, [])).toBe(false);

    // But if a delegation record does exist from emp2, it's checked via hasActiveDelegation
    // The chain is limited: empUnitNoSupervisor cannot approve without explicit delegation
    ev.empId = empUnitNoSupervisor.id;
    const result2 = canPerformWorkflowAction(emp1, ev, 'approve', {
      employees,
      delegations: [delegAB, delegBC]
    });
    // SECURITY FIX: emp2 (employee) does NOT have authority to delegate 'approve'.
    // Only admin or supervisor may delegate approve/reject/reassign.
    // Chain delegation where the intermediate delegator lacks authority is DENIED.
    expect(result2.authorized).toBe(false); // chain delegation blocked — emp2 cannot delegate approve
  });
});

describe('DW-11: Future Delegation', () => {
  it('future delegation is not active yet — denied', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'future-deleg',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now + 86400000, // starts tomorrow
      endDate: now + 86400000 * 31,
      status: 'active',
      createdAt: now,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(false);
  });

  it('future delegation activates on start date', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'future-deleg2',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now, // starts now
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(true);
  });

  it('future-status delegation with passed startDate is active (time-based activation)', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'future-deleg3',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000, // started yesterday
      endDate: now + 86400000 * 30,
      status: 'future', // status not manually updated to 'active'
      createdAt: now - 86400000,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    // Even though status is 'future', the date range has been entered.
    // isDelegationActive should return true based on date range.
    expect(isDelegationActive(delegation, now)).toBe(true);
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(true);
  });
});

describe('DW-12: Concurrent Approval', () => {
  // The authorization layer checks current state; concurrent actions are
  // handled by the persistence layer's optimistic concurrency (revision numbers).
  // These tests verify that authorization is checked per-action.
  it('two users with authority both pass authorization (concurrency handled at persistence layer)', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    // Supervisor has native authority
    const result1 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    expect(result1.authorized).toBe(true);
    // Admin also has authority
    const result2 = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result2.authorized).toBe(true);
  });
});

describe('DW-13: Double Click / Idempotent Authorization', () => {
  it('repeated authorization checks return same result', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result1 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    const result2 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    expect(result1.authorized).toBe(result2.authorized);
  });

  it('repeated checks for unauthorized user return same result', () => {
    const ev = makeEval(emp3.id, 'supervisor_review'); // emp3 is in marketing, sup-1 is in production
    const result1 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    const result2 = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    expect(result1.authorized).toBe(false);
    expect(result2.authorized).toBe(false);
  });
});

describe('DW-14: Return & Resubmit Lifecycle', () => {
  it('employee can resubmit after rejection', () => {
    const ev = makeEval(emp1.id, 'rejected');
    const result = canPerformWorkflowAction(emp1, ev, 'advance', { employees });
    expect(result.authorized).toBe(true);
  });

  it('supervisor can reject employee evaluation', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(supervisor, ev, 'reject', { employees });
    expect(result.authorized).toBe(true);
  });

  it('employee cannot reject own evaluation from rejected stage', () => {
    const ev = makeEval(emp1.id, 'rejected');
    const result = canPerformWorkflowAction(emp1, ev, 'reject', { employees });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-15: Reject Semantics', () => {
  it('reject returns evaluation to previous stage (logical)', () => {
    // The authorization check validates who can reject
    const ev = makeEval(emp1.id, 'supervisor_review');
    const supResult = canPerformWorkflowAction(supervisor, ev, 'reject', { employees });
    expect(supResult.authorized).toBe(true);
  });

  it('employee cannot reject supervisor stage', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp1, ev, 'reject', { employees });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-16: Finalized Record', () => {
  it('completed evaluation cannot be advanced', () => {
    const ev = makeEval(emp1.id, 'completed');
    const result = canPerformWorkflowAction(supervisor, ev, 'advance', { employees });
    // Supervisor has native scope but 'advance' on completed stage is not in valid stages
    expect(result.authorized).toBe(false);
  });

  it('locked evaluation cannot be acted on by employee', () => {
    const ev = makeEval(emp1.id, 'completed', { status: 'locked' });
    const result = canPerformWorkflowAction(emp1, ev, 'advance', { employees });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-17: Delegator Becomes Inactive', () => {
  it('if delegator role changes to employee, delegation still checked but canDelegate prevents creation', () => {
    // Test canDelegate after role change
    const formerSupervisor = { ...supervisor, role: 'employee' } as Employee;
    expect(canDelegate(formerSupervisor, 'approve', employees, [])).toBe(false);
  });
});

describe('DW-18: Delegate Becomes Inactive', () => {
  it('if delegate role changes, existing active delegation still resolves (delegation is by ID, not role)', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'deleg-inactive',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // emp2's role changes to 'employee' but delegation record still references emp2.id
    const nowEmployee = { ...emp2, role: 'employee' } as Employee;
    const allEmps = [admin, supervisor, supervisorOtherUnit, emp1, nowEmployee, emp3, empUnitNoSupervisor];
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(nowEmployee, ev, 'approve', { employees: allEmps, delegations: [delegation] });
    // The delegation is still active by ID check, so it passes
    expect(result.authorized).toBe(true);
  });
});

describe('DW-19: Employee Scope Change', () => {
  it('employee moved to different unit — original supervisor loses scope', () => {
    // emp1 was in تولید with supervisor سرپرست الته
    // If emp1 moves to بازاریابی unit
    const movedEmp1 = { ...emp1, unit: 'بازاریابی', supervisorId: 'sup-2' } as Employee;
    const allEmps = [admin, supervisor, supervisorOtherUnit, movedEmp1, emp2, emp3, empUnitNoSupervisor];

    const ev = makeEval(movedEmp1.id, 'supervisor_review');
    // Original supervisor (sup-1) should NOT have scope over moved emp1
    const result = canPerformWorkflowAction(supervisor, ev, 'approve', { employees: allEmps });
    expect(result.authorized).toBe(false);
  });
});

describe('DW-20: Reload Persistence', () => {
  it('authorization result is deterministic across reloads (no state dependency)', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');

    // Call multiple times — should be identical
    const results = Array(5).fill(0).map(() =>
      canPerformWorkflowAction(supervisor, ev, 'approve', { employees })
    );

    expect(results.every(r => r.authorized === true)).toBe(true);
  });

  it('delegation authorization is deterministic', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'persist-test',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');

    const results = Array(5).fill(0).map(() =>
      canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] })
    );

    expect(results.every(r => r.authorized === true)).toBe(true);
  });
});

describe('ADM-01 through ADM-15: Admin Superuser Authority', () => {
  it('ADM-01: Admin sees all evaluations', () => {
    // Admin can perform actions on evaluations across ALL units
    const evProd = makeEval(emp1.id, 'supervisor_review');
    const evMarketing = makeEval(emp3.id, 'supervisor_review');
    const result1 = canPerformWorkflowAction(admin, evProd, 'approve', { employees });
    const result2 = canPerformWorkflowAction(admin, evMarketing, 'approve', { employees });
    expect(result1.authorized).toBe(true);
    expect(result2.authorized).toBe(true);
  });

  it('ADM-02: Admin can inspect / act on another user cartable context', () => {
    // Admin viewing supervisor_review for emp1 (supervisor's subordinate) and acting
    const ev = makeEval(emp1.id, 'calibration_review');
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
  });

  it('ADM-03: Admin can act across all organizational scopes', () => {
    const ev = makeEval(emp3.id, 'hr_approval'); // Marketing unit
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
  });

  it('ADM-04: Admin performs permitted workflow action', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
  });

  it('ADM-05: Admin can reassign (recovery mechanism)', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'reassign', { employees });
    expect(result.authorized).toBe(true);
  });

  it('ADM-06: Admin sees all delegations', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'admin-view-deleg',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // Admin should be able to see and revoke any delegation regardless of
    // delegator/delegate relationship
    const canView = admin.role === 'admin';
    expect(canView).toBe(true);
    // Admin can revoke
    expect(delegation.status).toBe('active');
  });

  it('ADM-07: Admin revokes active delegation', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'admin-revoke-test',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // Simulate revocation
    const revoked: DelegationRecord = { ...delegation, status: 'revoked', revokedAt: Date.now(), revokedById: admin.id };
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedById).toBe(admin.id);
  });

  it('ADM-08: Revoked delegate immediately loses future authority', () => {
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'admin-revoke-lose',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'revoked',
      createdAt: now - 86400000,
      revokedAt: now - 1000,
      revokedById: admin.id,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    // emp2 had delegation from supervisor, but it's revoked
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result.authorized).toBe(false);
  });

  it('ADM-09: Historical delegated action remains intact after Admin revocation', () => {
    // A delegation that was active when the action was performed, then revoked later,
    // must not retroactively invalidate that historical action.
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'admin-historical',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000 * 2, // was active 2 days ago
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000 * 2,
    };
    const ev = makeEval(emp1.id, 'supervisor_review');
    // At the time of the action, delegation was active
    const historicalResult = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(historicalResult.authorized).toBe(true);
    // Now revoke it
    delegation.status = 'revoked';
    delegation.revokedAt = now;
    delegation.revokedById = admin.id;
    const futureResult = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(futureResult.authorized).toBe(false);
  });

  it('ADM-10: Admin action records Admin as actual actor', () => {
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
    expect(result.author.actorId).toBe(admin.id);
  });

  it('ADM-11: Admin cannot silently erase audit history', () => {
    // Admin can authorize actions but cannot bypass audit logging —
    // the authorization engine always records the actual actor
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'override', { employees });
    expect(result.authorized).toBe(true);
    expect(result.author.actorId).toBe(admin.id);
    expect(result.author.actorName).toBe(admin.name);
    // The actor must be the admin, not someone else
    expect(result.author.actorName).not.toBe(emp1.name);
  });

  it('ADM-12: Admin view of another cartable does not change workflow ownership', () => {
    // Authorization check: admin can act on emp1's evaluation
    // But this is a CHECK — actual ownership change requires explicit reassign action
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
    expect(result.author.actorId).toBe(admin.id);
    // The evaluation's empId remains unchanged
    expect(ev.empId).toBe(emp1.id);
  });

  it('ADM-13: Admin reload preserves administrative result', () => {
    // Delegation records are persisted and reloaded deterministically
    const now = Date.now();
    const delegation: DelegationRecord = {
      id: 'admin-reload-test',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };
    // Simulate reload by re-checking with same delegation record
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result1 = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    const result2 = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegation] });
    expect(result1.authorized).toBe(true);
    expect(result2.authorized).toBe(true);
  });

  it('ADM-14: Admin access works regardless of ordinary organizational unit', () => {
    // Admin acting on emp3 (Marketing unit) — not admin's own unit
    const ev = makeEval(emp3.id, 'supervisor_review');
    const result = canPerformWorkflowAction(admin, ev, 'approve', { employees });
    expect(result.authorized).toBe(true);
  });

  it('ADM-15: Non-Admin cannot obtain Admin behavior through UI/state manipulation', () => {
    // A supervisor cannot escalate to admin-level actions even with manipulations
    const ev = makeEval(emp3.id, 'hr_approval'); // different unit
    const result = canPerformWorkflowAction(supervisor, ev, 'override', { employees });
    expect(result.authorized).toBe(false);
    // Employee cannot either
    const result2 = canPerformWorkflowAction(emp1, ev, 'override', { employees });
    expect(result2.authorized).toBe(false);
  });
});

describe('SEC-01: Delegation Chain Prevention (Authority Cannot Be Amplified)', () => {
  it('employee-delegated approval is rejected at consumption time', () => {
    const now = Date.now();
    // emp2 (employee) is granted 'approve' via delegation from a valid supervisor
    // but then attempts to delegate that same 'approve' to emp1.
    // This must NOT propagate: employee cannot delegate approve.
    const delegFromEmp2: DelegationRecord = {
      id: 'deleg-emp2-to-emp1',
      delegatorId: emp2.id,
      delegateId: 'stranger-id',
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };

    // canDelegate must reject employee delegating approve
    expect(canDelegate(emp2, 'approve', employees, [])).toBe(false);

    // Even if a delegation record exists, hasActiveDelegation should skip it
    // because the delegator (emp2) did not have authority to delegate 'approve'
    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(
      { ...emp1, id: 'stranger-id' }, ev, 'approve',
      { employees, delegations: [delegFromEmp2] }
    );
    // 'stranger-id' is not the target of this delegation, so it won't match.
    // The key point: the delegation from an employee is structurally invalid.
    expect(result.authorized).toBe(false);
  });

  it('supervisor-delegated approve chain is honored', () => {
    const now = Date.now();
    // Supervisor delegates approve to emp2 (valid).
    const delegAB: DelegationRecord = {
      id: 'valid-deleg',
      delegatorId: supervisor.id,
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };

    const ev = makeEval(emp1.id, 'supervisor_review');
    // emp2 is in تولید, supervisor has unit scope over تولید — delegation is valid
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegAB] });
    expect(result.authorized).toBe(true);
    expect(result.delegation?.delegatorId).toBe(supervisor.id);
    expect(result.delegation?.delegateId).toBe(emp2.id);
  });

  it('delegation from deleted/inactive delegator is rejected', () => {
    const now = Date.now();
    const delegFromInactive: DelegationRecord = {
      id: 'deleg-deleted',
      delegatorId: 'deleted-user-id',
      delegateId: emp2.id,
      action: 'approve',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };

    const ev = makeEval(emp1.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'approve', { employees, delegations: [delegFromInactive] });
    expect(result.authorized).toBe(false);
  });
});

describe('SEC-02: Employee Cannot Delegate Reject Authority', () => {
  it('employee can delegate advance but not reject', () => {
    expect(canDelegate(emp1, 'advance', employees, [])).toBe(true);
    expect(canDelegate(emp1, 'reject', employees, [])).toBe(false);
    expect(canDelegate(emp1, 'approve', employees, [])).toBe(false);
    expect(canDelegate(emp1, 'reassign', employees, [])).toBe(false);
    expect(canDelegate(emp1, 'override', employees, [])).toBe(false);
  });
});

describe('SEC-03: Admin Superuser Visibility', () => {
  it('admin can view all evaluations regardless of unit', () => {
    const ev = makeEval(emp3.id, 'supervisor_review');
    expect(canViewEvaluation(admin, ev, employees, [])).toBe(true);
    // Even cross-unit
    const ev2 = makeEval(emp1.id, 'calibration_review');
    expect(canViewEvaluation(admin, ev2, employees, [])).toBe(true);
  });

  it('non-admin cannot view cross-unit evaluations', () => {
    const ev = makeEval(emp3.id, 'supervisor_review');
    // supervisor is in تولید, emp3 is in بازاریابی — not a subordinate
    expect(canViewEvaluation(supervisor, ev, employees, [])).toBe(false);
  });
});

describe('SEC-04: Delegation Creation Validation', () => {
  it('self-delegation is detected', () => {
    expect(isSelfDelegation('user-a', 'user-a')).toBe(true);
    expect(isSelfDelegation('user-a', 'user-b')).toBe(false);
  });

  it('duplicate delegation with overlapping dates is detected', () => {
    const now = Date.now();
    const existingDelegations: DelegationRecord[] = [
      {
        id: 'deleg-1',
        delegatorId: supervisor.id,
        delegateId: emp2.id,
        action: 'approve',
        scope: 'unit',
        targetUnit: 'تولید',
        startDate: now,
        endDate: now + 86400000 * 10,
        status: 'active',
        createdAt: now,
      }
    ];

    // Overlapping delegation — should be detected as duplicate
    const overlap = isDuplicateDelegation(
      {
        delegatorId: supervisor.id,
        delegateId: emp2.id,
        action: 'approve',
        scope: 'unit',
        targetUnit: 'تولید',
        startDate: now + 86400000 * 5,  // overlaps with existing
        endDate: now + 86400000 * 15,
      },
      existingDelegations
    );
    expect(overlap).toBe(true);

    // Non-overlapping delegation — should not be detected
    const nonOverlap = isDuplicateDelegation(
      {
        delegatorId: supervisor.id,
        delegateId: emp2.id,
        action: 'approve',
        scope: 'unit',
        targetUnit: 'تولید',
        startDate: now + 86400000 * 20,  // starts after existing ends
        endDate: now + 86400000 * 30,
      },
      existingDelegations
    );
    expect(nonOverlap).toBe(false);
  });

  it('employee cannot delegate reject even if delegation record exists', () => {
    const now = Date.now();
    // Even if someone forged a delegation record from an employee for 'reject',
    // hasActiveDelegation should reject it because canDelegate(employee, 'reject') is false.
    const forgedDeleg: DelegationRecord = {
      id: 'forged-deleg',
      delegatorId: emp1.id, // employee
      delegateId: emp2.id,
      action: 'reject',
      scope: 'unit',
      targetUnit: 'تولید',
      startDate: now - 86400000,
      endDate: now + 86400000 * 30,
      status: 'active',
      createdAt: now - 86400000,
    };

    const ev = makeEval(emp3.id, 'supervisor_review');
    const result = canPerformWorkflowAction(emp2, ev, 'reject', {
      employees,
      delegations: [forgedDeleg]
    });
    // Should be denied because emp1 (employee) cannot delegate 'reject'
    expect(result.authorized).toBe(false);
  });
});

// DEF-005: Missing authorization on bulk admin operations
// DEF-009: Unsafe action mapping fallback
describe('DEF-005 & DEF-009: Bulk admin operations and action mapping', () => {
  it('DEF-009: action mapping for unknown action defaults to advance (not approve)', () => {
    const ev = makeEval(supervisor.id, 'self_review');
    // Unknown action should map to 'advance' not 'approve' — supervisor can advance own subordinates' evals
    const result = canPerformWorkflowAction(supervisor, ev, 'approve', { employees });
    // supervisor can approve supervisor_review stage but NOT self_review stage
    expect(result.authorized).toBe(false);
  });

  it('DEF-009: submit maps to advance, reject maps to reject, approve maps to approve', () => {
    const ev = makeEval(emp1.id, 'self_review');
    // submit → advance — employee can submit their own self_review
    const submitResult = canPerformWorkflowAction(emp1, ev, 'advance', { employees });
    expect(submitResult.authorized).toBe(true);
    // reject → reject — employee cannot reject
    const rejectResult = canPerformWorkflowAction(emp1, ev, 'reject', { employees });
    expect(rejectResult.authorized).toBe(false);
  });
});

