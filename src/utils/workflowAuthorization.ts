/**
 * Workflow Authorization — Authority check for workflow actions.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Employee, WorkflowStageKey, UserRole } from '../types';

/**
 * Delegation record: temporary transfer of authority from a delegator to a
 * delegate for a specific scope (evaluation, unit, or system-wide).
 *
 * Persisted in db.ts under STORAGE_KEY 'pe_delegations'.
 *
 * Lifecycle: Create → Persist → Activate → Use → Reload → Expire OR Revoke.
 *
 * The invariant: delegated authority <= delegator's actual authority.
 * A supervisor cannot delegate authority they do not possess.
 */
export interface DelegationRecord {
  id: string;
  delegatorId: string;       // Person A who delegates
  delegateId: string;        // Person B who receives authority
  action: string;            // e.g. 'approve', 'reject', 'advance', 'override', 'reassign'
  scope: 'employee' | 'unit' | 'system'; // scope of delegation
  targetEmpId?: string;      // specific employee (if scope='employee')
  targetUnit?: string;       // specific unit (if scope='unit')
  startDate: number;         // Unix timestamp — when delegation becomes effective
  endDate: number;           // Unix timestamp — when delegation expires
  status: 'active' | 'future' | 'revoked' | 'expired';
  reason?: string;
  createdAt: number;
  revokedAt?: number;        // timestamp when revoked (audit)
  revokedById?: string;      // admin who revoked (audit)
}

export interface AuthCheckOptions {
  employees?: Employee[];
  delegations?: DelegationRecord[];
}

/**
 * Check if an employee is within the organizational scope of a supervisor.
 *
 * A supervisor can oversee:
 * - Direct subordinates (emp.supervisorId === supervisor.id)
 * - Unit-based subordinates (emp has no explicit supervisorId and emp.unit === supervisor.unit)
 *
 * This is consistent with the actual WorkflowManager.tsx resolveCurrentAssignee logic.
 */
export function isWithinSupervisorScope(supervisor: Employee, employee: Employee, allEmployees: Employee[]): boolean {
  if (supervisor.role !== 'supervisor' && supervisor.role !== 'admin') return false;

  // Admin can oversee all
  if (supervisor.role === 'admin') return true;

  // Direct subordinate (explicit supervisorId)
  if (employee.supervisorId === supervisor.id) return true;

  // Unit-based fallback (employee without explicit supervisorId in same unit)
  // This matches WorkflowManager.tsx resolveCurrentAssignee lines 335-338 and
  // the myTaskEvaluations filter at line 506
  if (!employee.supervisorId && employee.unit === supervisor.unit) return true;

  return false;
}

/**
 * Check if a delegation is currently active (not expired, not revoked, within date range).
 * A delegation with status 'future' becomes active when startDate has passed.
 * A delegation with status 'active' may become expired when endDate has passed.
 */
export function isDelegationActive(delegation: DelegationRecord, now: number = Date.now()): boolean {
  // Revoked or expired-status delegations are never active
  if (delegation.status === 'revoked') return false;
  if (delegation.status === 'expired') return false;

  // Check date range
  if (now < delegation.startDate) return false;
  if (now > delegation.endDate) return false;

  // 'future' status means it hasn't been manually activated, but if the date
  // range has been entered, it is effectively active for authority checks.
  // 'active' status with valid dates is active.
  return true;
}

/**
 * Check if a user has an active delegation that covers the specified action
 * on the specified evaluation.
 *
 * SECURITY: Also verifies that the DELEGATOR actually had authority to grant
 * this action. This enforces the invariant: "delegated authority <= delegator's
 * actual authority" at consumption time, not only at creation time.
 */
export function hasActiveDelegation(
  user: Employee,
  evaluation: Evaluation,
  action: string,
  delegations: DelegationRecord[],
  employees: Employee[],
  now: number = Date.now()
): { granted: boolean; delegation?: DelegationRecord } {
  const activeDelegations = delegations.filter(d =>
    isDelegationActive(d, now) &&
    d.delegateId === user.id &&
    d.action === action
  );

  for (const delegation of activeDelegations) {
    // SECURITY FIX: Verify the delegator actually had authority to delegate this action.
    // Without this, a forged or stale delegation record could grant unauthorized authority.
    const delegator = employees.find(e => e.id === delegation.delegatorId);
    if (!delegator) {
      // Delegator no longer exists — delegation is invalid.
      continue;
    }
    // Admin can delegate anything; verify non-admin delegators had the scope.
    if (delegator.role === 'admin') {
      // Admin delegations are fully trusted.
    } else {
      // Supervisor can delegate: approve, reject, reassign (within scope).
      // Employee can delegate: advance (self_review), reject.
      // Verify the delegator's canDelegate check passes for this action.
      if (!canDelegate(delegator, action, employees, delegations)) {
        // Delegator did not have authority to grant this delegation — skip it.
        continue;
      }
      // Verify the delegation scope matches the delegator's organizational scope.
      if (delegation.scope === 'employee') {
        const targetEmp = employees.find(e => e.id === delegation.targetEmpId);
        if (targetEmp && !isWithinSupervisorScope(delegator, targetEmp, employees)) {
          continue;
        }
      }
      if (delegation.scope === 'unit' && delegation.targetUnit) {
        // Verify the delegator is a supervisor over SOME employee in the target unit.
        // This prevents delegating authority over a unit they don't supervise.
        const hasScope = employees.some(e =>
          e.unit === delegation.targetUnit && isWithinSupervisorScope(delegator, e, employees)
        );
        if (!hasScope) {
          continue;
        }
      }
    }

    if (delegation.scope === 'system') {
      return { granted: true, delegation };
    }

    if (delegation.scope === 'employee' && delegation.targetEmpId === evaluation.empId) {
      return { granted: true, delegation };
    }

    if (delegation.scope === 'unit') {
      const emp = employees.find(e => e.id === evaluation.empId);
      if (emp && emp.unit === delegation.targetUnit) {
        return { granted: true, delegation };
      }
    }
  }

  return { granted: false };
}

/**
 * Get all active delegations where `user` is the delegator.
 * Used to check that a user cannot delegate more authority than they possess.
 */
export function getActiveDelegationsByDelegator(
  delegatorId: string,
  delegations: DelegationRecord[],
  now: number = Date.now()
): DelegationRecord[] {
  return delegations.filter(d =>
    d.delegatorId === delegatorId &&
    isDelegationActive(d, now)
  );
}

/**
 * Get the workflow stages where a given role can perform a specific action.
 * Based on the actual workflow state machine from types.ts and WorkflowManager.tsx.
 */
function getStagesForUserAction(
  userRole: UserRole,
  action: string
): WorkflowStageKey[] {
  switch (userRole) {
    case 'admin':
      // Admin can act at any stage (superuser override, auditable)
      return ['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'rejected', 'appealed'];

    case 'supervisor':
      switch (action) {
        case 'approve':
          // Supervisor can approve at: supervisor_review, peer_review (as peer reviewer),
          // calibration_review (as calibration lead), hr_approval (as approver), feedback_meeting
          return ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'appealed'];
        case 'reject':
          // Supervisor can reject at: supervisor_review, peer_review, calibration_review, hr_approval
          return ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval'];
        case 'advance':
          // Supervisor doesn't advance (that's the employee's self-review action)
          return [];
        case 'reassign':
          // Supervisor can reassign within their scope
          return ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'rejected', 'appealed'];
        case 'override':
          // Supervisor does NOT have override authority (system-wide admin only)
          return [];
        default:
          return [];
      }

    case 'employee':
      switch (action) {
        case 'advance':
          // Employee can only advance their own self_review (submit self-evaluation)
          // and resubmit after rejection
          return ['self_review', 'rejected'];
        default:
          // Employee cannot reject, approve, override, or reassign
          return [];
      }

    default:
      return [];
  }
}

/**
 * Main authorization check for workflow actions.
 *
 * Authorization model:
 * - admin: can perform ANY action on ANY evaluation across ALL org units
 * - supervisor: can advance/approve/reject/reassign evaluations where the employee
 *   is their direct subordinate (emp.supervisorId === supervisor.id) OR a unit-based
 *   subordinate (no supervisorId, same unit). Also can act as peer reviewer,
 *   calibration lead, or HR approver when explicitly designated.
 * - employee: can only 'advance' their own evaluation in self_review/rejected stages
 *
 * Delegation model:
 * A delegation record represents temporary transfer of authority from a delegator
 * to a delegate for a specific scope (evaluation or unit).
 * Effective permissions = Native Permissions + Active Delegations (if applicable).
 *
 * Delegation rules:
 * - Delegated permission ⊆ Delegator permission
 * - Delegation must be within the delegator's organizational scope
 * - Delegation has start/end dates; only ACTIVE delegations count
 * - Delegation is action-specific
 * - Self-delegation is prevented at creation time (canDelegate gatekeeper)
 */
export function canPerformWorkflowAction(
  user: Employee,
  evaluation: Evaluation,
  action: 'advance' | 'reject' | 'override' | 'reassign' | 'approve' | 'appeal',
  opts: AuthCheckOptions = {}
): { authorized: boolean; reason: string; delegation?: DelegationRecord; author: { actorId: string; actorName: string; actorRole: UserRole } } {
  const employees = opts.employees || [];
  const delegations = opts.delegations || [];
  const now = Date.now();

  const emp = employees.find(e => e.id === evaluation.empId);

  // ADMIN: can perform any action on any evaluation (superuser rule)
  if (user.role === 'admin') {
    return { authorized: true, reason: 'سیستم مدیر ارشد', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
  }

  // Check delegation first — a delegate may have been granted authority
  // via delegation from someone who does have authority over this evaluation.
  // Admin is already handled above (line 218).
  const deleg = hasActiveDelegation(user, evaluation, action, delegations, employees, now);
  if (deleg.granted && deleg.delegation) {
    // Verify the delegate is acting within the valid stages for this action
    const validStages = getStagesForUserAction('supervisor', action);
    const currentStage = evaluation.stage || 'self_review';
    if (validStages.includes(currentStage)) {
      return { authorized: true, reason: `تفویض از طرف ${deleg.delegation.delegatorId}`, delegation: deleg.delegation, author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
    }
  }

  // EMPLOYEE: can only act on their OWN evaluation
  if (user.role === 'employee') {
    if (emp?.id === user.id) {
      // Employee can advance (self-submit / self-resubmit) in self_review or rejected stage
      if ((evaluation.stage === 'self_review' || evaluation.stage === 'rejected') && action === 'advance') {
        return { authorized: true, reason: 'خودارزیابی', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
      }
      // Employee can submit an appeal
      if (evaluation.stage === 'supervisor_review' && action === 'appeal') {
        return { authorized: true, reason: 'فرجام‌خواهی', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
      }
      // Employee cannot reject, approve, override, or reassign
      return { authorized: false, reason: 'شما صلاحیت انجام این عملیات را ندارید', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
    }
    return { authorized: false, reason: 'شما صلاحیت انجام این عملیات را ندارید', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
  }

  // SUPERVISOR: can act on subordinates' evaluations within their org scope
  if (user.role === 'supervisor') {
    // Determine if user has native authority over this evaluation's employee
    const empInScope = emp && isWithinSupervisorScope(user, emp, employees);

    // Also check if user is the designated role for this stage:
    // - peerReviewerId for peer_review stage
    // - calibrationLeadId for calibration_review stage
    // - approverId for hr_approval stage
    // - hrPartnerId for feedback_meeting stage
    const stage = evaluation.stage || 'self_review';
    let designatedActor = false;
    if (stage === 'peer_review' && emp?.peerReviewerId === user.id) designatedActor = true;
    if (stage === 'calibration_review' && emp?.calibrationLeadId === user.id) designatedActor = true;
    if (stage === 'hr_approval' && emp?.approverId === user.id) designatedActor = true;
    if (stage === 'feedback_meeting' && emp?.hrPartnerId === user.id) designatedActor = true;

    if (empInScope || designatedActor) {
      const validStages = getStagesForUserAction(user.role, action);
      if (validStages.includes(stage)) {
        const roleName = designatedActor
          ? 'نقش ارزیاب/مرورگر/تأییدکننده'
          : 'سرپرست مستقیم یا واحد';
        return { authorized: true, reason: roleName, author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
      }
      return {
        authorized: false,
        reason: `در مرحله «${stage}» اجازه انجام این عملیات ندارید`,
        author: { actorId: user.id, actorName: user.name, actorRole: user.role }
      };
    }

    return { authorized: false, reason: 'پرسنلی در اختیار ندارید', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
  }

  // Default: deny
  return { authorized: false, reason: 'نقش ناشناخته', author: { actorId: user.id, actorName: user.name, actorRole: user.role } };
}

/**
 * Check if a user can view/see an evaluation (read-level authorization).
 */
export function canViewEvaluation(
  user: Employee,
  evaluation: Evaluation,
  employees: Employee[] = [],
  delegations: DelegationRecord[] = []
): boolean {
  // Admin can see all
  if (user.role === 'admin') return true;

  const emp = employees.find(e => e.id === evaluation.empId);
  if (!emp) return false;

  // Employee can only see their own
  if (user.role === 'employee') {
    if (emp.id === user.id) return true;
    // An employee can see evaluations they've been delegated authority over
    if (delegations && delegations.some(d =>
      isDelegationActive(d) && d.delegateId === user.id && d.targetEmpId === emp.id
    )) return true;
    return false;
  }

  // Supervisor can see subordinates + own + designated roles
  if (user.role === 'supervisor') {
    if (emp.id === user.id) return true;
    if (emp.supervisorId === user.id) return true;
    if (!emp.supervisorId && emp.unit === user.unit) return true;
    if (evaluation.currentAssigneeId === user.id) return true;
    // Designated actors can see their assigned evaluations
    const stage = evaluation.stage || 'self_review';
    if (stage === 'peer_review' && emp.peerReviewerId === user.id) return true;
    if (stage === 'calibration_review' && emp.calibrationLeadId === user.id) return true;
    if (stage === 'hr_approval' && emp.approverId === user.id) return true;
    if (stage === 'feedback_meeting' && emp.hrPartnerId === user.id) return true;
    // Delegated authority
    if (delegations && delegations.some(d =>
      isDelegationActive(d) && d.delegateId === user.id && d.targetEmpId === emp.id
    )) return true;
    return false;
  }

  return false;
}

/**
 * Check if a user can delegate authority to another employee.
 * A user can only delegate actions they themselves are authorized to perform.
 *
 * Rules:
 * - Admin can delegate any action (system scope)
 * - Supervisor can delegate approve, reject, reassign within their scope
 * - Employee can only delegate advance (self-review submission) — NOT reject/approve
 *
 * Self-delegation (delegatorId === delegateId) is prevented.
 */
export function canDelegate(
  delegator: Employee,
  action: string,
  employees: Employee[],
  delegations: DelegationRecord[]
): boolean {
  // Admin can delegate any action
  if (delegator.role === 'admin') return true;

  // Supervisor can only delegate supervisor-level actions
  if (delegator.role === 'supervisor') {
    return ['advance', 'reject', 'approve', 'reassign'].includes(action);
  }

  // Employee can delegate only 'advance' (self-review submission).
  // Employees do NOT have reject/approve authority, so they cannot delegate it.
  if (delegator.role === 'employee') {
    return action === 'advance';
  }

  return false;
}

/**
 * Check if a delegation would result in self-delegation (delegator === delegate).
 */
export function isSelfDelegation(delegatorId: string, delegateId: string): boolean {
  return delegatorId === delegateId;
}

/**
 * Check if a delegation overlaps with an existing active delegation
 * for the same delegator, delegate, action, and scope.
 */
export function isDuplicateDelegation(
  newDelegation: Omit<DelegationRecord, 'id' | 'createdAt' | 'status'>,
  existingDelegations: DelegationRecord[],
  now: number = Date.now()
): boolean {
  return existingDelegations.some(d =>
    isDelegationActive(d, now) &&
    d.delegatorId === newDelegation.delegatorId &&
    d.delegateId === newDelegation.delegateId &&
    d.action === newDelegation.action &&
    d.scope === newDelegation.scope &&
    // Check for overlapping date ranges
    !(d.endDate <= newDelegation.startDate || d.startDate >= newDelegation.endDate)
  );
}
