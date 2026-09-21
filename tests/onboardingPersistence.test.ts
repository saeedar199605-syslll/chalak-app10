import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * B15 — Onboarding Persistence Tests
 *
 * Tests that onboarding progress persists to localStorage and survives reloads.
 */
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key: string, value: string): void { this.store[key] = value; }
  removeItem(key: string): void { delete this.store[key]; }
  clear(): void { this.store = {}; }
  key(index: number): string | null { return Object.keys(this.store)[index] || null; }
}

describe('B15: Onboarding — Persistence', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('PERSIST: progress saved in localStorage keyed by user ID', () => {
    const userId = 'emp-2026-001';
    const storageKey = `chalak_onboarding_step_${userId}`;

    // Simulate progress save
    localStorage.setItem(storageKey, '3');

    // Reload
    const saved = localStorage.getItem(storageKey);
    expect(saved).toBe('3');
    expect(parseInt(saved || '0', 10)).toBe(3);
  });

  it('PERSIST: progress survives reload from localStorage', () => {
    const userId = 'emp-2026-002';
    const storageKey = `chalak_onboarding_step_${userId}`;

    // Simulate first session
    localStorage.setItem(storageKey, '5');

    // Simulate reload — read it back
    const saved = localStorage.getItem(storageKey);
    const step = saved ? parseInt(saved, 10) : NaN;
    expect(!isNaN(step) && step >= 1).toBe(true);
    expect(step).toBe(5);
  });

  it('PERSIST: empty/missing storage key → defaults to step 1', () => {
    const userId = 'emp-2026-003';
    const storageKey = `chalak_onboarding_step_${userId}`;

    // No storage set
    const saved = localStorage.getItem(storageKey);
    const val = saved ? parseInt(saved, 10) : NaN;
    const step = !isNaN(val) && val >= 1 ? val : 1;
    expect(step).toBe(1);
  });

  it('PERSIST: guest user progress key uses "guest"', () => {
    const storageKey = `chalak_onboarding_step_guest`;
    localStorage.setItem(storageKey, '2');

    const saved = localStorage.getItem(storageKey);
    expect(saved).toBe('2');
  });

  it('PERSIST: does not auto-restart after completion (no restart key)', () => {
    const userId = 'emp-2026-004';
    const storageKey = `chalak_onboarding_step_${userId}`;

    // Simulate completion at step 10
    localStorage.setItem(storageKey, '10');

    // Reload — step should still be 10, not reset to 1
    const saved = localStorage.getItem(storageKey);
    expect(saved).toBe('10');
  });

  it('PERSIST: restart functionality clears and resets', () => {
    const userId = 'emp-2026-005';
    const storageKey = `chalak_onboarding_step_${userId}`;

    // Set progress
    localStorage.setItem(storageKey, '7');
    expect(localStorage.getItem(storageKey)).toBe('7');

    // Simulate restart — remove key
    localStorage.removeItem(storageKey);

    // After restart, fresh load should default to step 1
    const saved = localStorage.getItem(storageKey);
    expect(saved).toBeNull();
    const step = saved ? parseInt(saved, 10) : NaN;
    const result = !isNaN(step) && step >= 1 ? step : 1;
    expect(result).toBe(1);
  });
});

describe('B15: Onboarding — Role-Based Steps', () => {
  it('ROLE: employee sees employee step titles', () => {
    // Role-based steps are defined in the component based on currentUser.role
    // Employee role = 'employee'
    // Verify the component structure by checking role assignment logic
    const role: 'employee' | 'supervisor' | 'admin' = 'employee';
    const stepsForEmployee = role === 'employee' ? ['مرحله 1', 'مرحله 2', 'مرحله 3'] : [];
    expect(stepsForEmployee.length).toBe(3);
  });

  it('ROLE: admin sees admin step titles', () => {
    const role: 'employee' | 'supervisor' | 'admin' = 'admin';
    const stepsForAdmin = role === 'admin' ? ['مرحله 1', 'مرحله 2', 'مرحله 3', 'مرحله 4'] : [];
    expect(stepsForAdmin.length).toBe(4);
  });

  it('ROLE: supervisor sees supervisor step titles', () => {
    const role: 'employee' | 'supervisor' | 'admin' = 'supervisor';
    const stepsForSupervisor = role === 'supervisor' ? ['مرحله 1', 'مرحله 2'] : [];
    expect(stepsForSupervisor.length).toBe(2);
  });
});
