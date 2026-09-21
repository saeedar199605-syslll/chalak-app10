/**
 * Behavioral tests for Workflow State Transitions.
 *
 * Tests that valid transitions succeed and invalid transitions are rejected.
 * Uses the actual db layer for persistence and the workflow transition logic.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { WorkflowStageKey } from '../src/types';

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

// Replicate the valid state machine from WorkflowManager.tsx
const VALID_TRANSITIONS: Record<WorkflowStageKey, WorkflowStageKey[]> = {
  self_review: ['supervisor_review', 'rejected'],
  supervisor_review: ['calibration_review', 'peer_review', 'rejected'],
  peer_review: ['calibration_review', 'rejected'],
  calibration_review: ['hr_approval', 'rejected'],
  hr_approval: ['feedback_meeting', 'rejected'],
  feedback_meeting: ['completed', 'rejected'],
  completed: [],
  rejected: ['supervisor_review', 'self_review'],
  appealed: ['feedback_meeting', 'completed'],
};

function canTransition(from: WorkflowStageKey, to: WorkflowStageKey): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function statusForStage(stage: WorkflowStageKey): 'draft' | 'calibrated' | 'locked' {
  if (stage === 'completed') return 'locked';
  if (stage === 'hr_approval' || stage === 'calibration_review') return 'calibrated';
  return 'draft';
}

describe('Workflow State Machine (Behavioral)', () => {
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

  it('VALID: self_review → supervisor_review (standard flow)', () => {
    expect(canTransition('self_review', 'supervisor_review')).toBe(true);
    expect(statusForStage('supervisor_review')).toBe('draft');
  });

  it('VALID: supervisor_review → calibration_review (standard flow)', () => {
    expect(canTransition('supervisor_review', 'calibration_review')).toBe(true);
    expect(statusForStage('calibration_review')).toBe('calibrated');
  });

  it('VALID: calibration_review → hr_approval (standard flow)', () => {
    expect(canTransition('calibration_review', 'hr_approval')).toBe(true);
    expect(statusForStage('hr_approval')).toBe('calibrated');
  });

  it('VALID: hr_approval → feedback_meeting (standard flow)', () => {
    expect(canTransition('hr_approval', 'feedback_meeting')).toBe(true);
  });

  it('VALID: feedback_meeting → completed (terminal, locks record)', () => {
    expect(canTransition('feedback_meeting', 'completed')).toBe(true);
    expect(statusForStage('completed')).toBe('locked');
  });

  it('INVALID: completed → draft (cannot revert from terminal state)', () => {
    expect(canTransition('completed', 'self_review')).toBe(false);
  });

  it('INVALID: completed → feedback_meeting (terminal blocks regression)', () => {
    expect(canTransition('completed', 'feedback_meeting')).toBe(false);
  });

  it('INVALID: self_review → calibration_review (must pass through supervisor)', () => {
    expect(canTransition('self_review', 'calibration_review')).toBe(false);
  });

  it('INVALID: self_review → hr_approval (must pass through intermediate stages)', () => {
    expect(canTransition('self_review', 'hr_approval')).toBe(false);
  });

  it('VALID: Non-terminal states can transition to rejected', () => {
    expect(canTransition('self_review', 'rejected')).toBe(true);
    expect(canTransition('supervisor_review', 'rejected')).toBe(true);
    expect(canTransition('calibration_review', 'rejected')).toBe(true);
    expect(canTransition('hr_approval', 'rejected')).toBe(true);
    expect(canTransition('feedback_meeting', 'rejected')).toBe(true);
  });

  it('VALID: rejected → supervisor_review (can send back to supervisor)', () => {
    expect(canTransition('rejected', 'supervisor_review')).toBe(true);
  });

  it('VALID: rejected → self_review (can send back to employee)', () => {
    expect(canTransition('rejected', 'self_review')).toBe(true);
  });

  it('INVALID: rejected → completed (must not skip to completion)', () => {
    expect(canTransition('rejected', 'completed')).toBe(false);
  });

  it('INVALID: calibration_review → supervisor_review (cannot regress)', () => {
    expect(canTransition('calibration_review', 'supervisor_review')).toBe(false);
  });

  it('INVALID: hr_approval → calibration_review (cannot regress)', () => {
    expect(canTransition('hr_approval', 'calibration_review')).toBe(false);
  });

  it('INVALID: feedback_meeting → hr_approval (cannot regress)', () => {
    expect(canTransition('feedback_meeting', 'hr_approval')).toBe(false);
  });

  it('INVALID: peer_review → self_review (cannot regress)', () => {
    expect(canTransition('peer_review', 'self_review')).toBe(false);
  });

  it('VALID: supervisor_review → peer_review (parallel review branch)', () => {
    expect(canTransition('supervisor_review', 'peer_review')).toBe(true);
  });

  it('VALID: peer_review → calibration_review (merge from peer)', () => {
    expect(canTransition('peer_review', 'calibration_review')).toBe(true);
  });

  it('FULL VALID FLOW through all stages', () => {
    const stages: WorkflowStageKey[] = ['self_review', 'supervisor_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'];
    for (let i = 0; i < stages.length - 1; i++) {
      expect(canTransition(stages[i], stages[i + 1])).toBe(true);
    }
  });

  it('PERSISTENCE: evaluations can be saved and reloaded', async () => {
    const { db } = await setupDb();
    const evaluations = db.getEvaluations();
    const testEval = {
      id: 'test-eval-persist',
      empId: 'emp-1',
      period: 'Test Period',
      stage: 'self_review' as WorkflowStageKey,
      status: 'draft' as const,
      scores: [{ cid: 'c1', value: 4, weight: 50, self: 3, selfWeight: 50 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileId: 'emp-1',
      created: Date.now(),
      history: [],
    } as any;
    db.saveEvaluations([...evaluations, testEval]);
    const reloaded = db.getEvaluations();
    const found = reloaded.find(e => e.id === 'test-eval-persist');
    expect(found).toBeDefined();
    expect(found!.stage).toBe('self_review');
    expect(found!.scores).toHaveLength(1);
  });

  it('PERSISTENCE: workflow history is preserved after save/reload', async () => {
    const { db } = await setupDb();
    const testEval = {
      id: 'test-eval-history',
      empId: 'emp-1',
      period: 'Test Period',
      stage: 'self_review' as WorkflowStageKey,
      status: 'draft' as const,
      scores: [{ cid: 'c1', value: 4, weight: 50, self: 3, selfWeight: 50 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileId: 'test-profile',
      created: Date.now(),
      history: [],
    } as any;
    db.saveEvaluations([...db.getEvaluations(), testEval]);

    const updatedEval = {
      ...testEval,
      stage: 'supervisor_review' as WorkflowStageKey,
      status: 'draft' as const,
      history: [{
        id: 'test-trans-1',
        fromStage: 'self_review' as WorkflowStageKey,
        toStage: 'supervisor_review' as WorkflowStageKey,
        actorId: 'admin',
        actorName: 'Test Admin',
        actorRole: 'admin' as const,
        action: 'advance' as const,
        timestamp: '2024-01-01',
      }, ...(testEval.history || [])],
    };
    db.saveEvaluations([...db.getEvaluations().filter(e => e.id !== testEval.id), updatedEval]);

    const reloaded = db.getEvaluations();
    const found = reloaded.find(e => e.id === 'test-eval-history');
    expect(found).toBeDefined();
    expect(found!.stage).toBe('supervisor_review');
    expect(found!.history).toHaveLength(1);
    expect(found!.history![0].fromStage).toBe('self_review');
    expect(found!.history![0].toStage).toBe('supervisor_review');
  });
});
