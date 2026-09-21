/**
 * Tests for the database re-seeding behavior.
 * 
 * CRITICAL: These tests verify the fix for the "job profiles reappear after deletion" bug
 * (and the same class of bug for criteria, employees, evaluations, and OKRs).
 * 
 * Root cause: get*() methods were seeding from SEED_* constants whenever the stored
 * array was empty, which silently undid user deletions on every read.
 * 
 * Fix: Seed only when the localStorage key is absent (null), not when the array is empty.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to test the AppDatabase class directly. Since db.ts imports from multiple
// modules and uses localStorage, we test via dynamic import with a mocked localStorage.

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

describe('AppDatabase re-seed behavior', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    // Use a fresh MemoryStorage for each test
    const memStorage = new MemoryStorage() as unknown as Storage;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).window = {
      ...((globalThis as any).window || {}),
      localStorage: memStorage,
      sessionStorage: memStorage,
      dispatchEvent: () => true,
    };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalLocalStorage;
    delete (globalThis as any).window;
  });

  it('seeds entities on first access when localStorage key is absent', async () => {
    const { db } = await import('../src/utils/db');
    const profiles = db.getProfiles();
    expect(profiles.length).toBe(3); // SEED_PROFILES has 3
    expect(profiles[0].title).toContain('اپراتور');
  });

  it('CRITICAL: does NOT re-seed profiles after they are deleted (empty array)', async () => {
    const { db } = await import('../src/utils/db');
    // First access seeds
    expect(db.getProfiles().length).toBe(3);
    // Delete all profiles
    db.saveProfiles([]);
    // Reading again must return empty, NOT re-seed
    const afterDelete = db.getProfiles();
    expect(afterDelete).toEqual([]);
  });

  it('CRITICAL: does NOT re-seed criteria after they are deleted', async () => {
    const { db } = await import('../src/utils/db');
    expect(db.getCriteria().length).toBeGreaterThan(0);
    db.saveCriteria([]);
    expect(db.getCriteria()).toEqual([]);
  });

  it('CRITICAL: does NOT re-seed employees after they are deleted', async () => {
    const { db } = await import('../src/utils/db');
    expect(db.getEmployees().length).toBeGreaterThan(0);
    db.saveEmployees([]);
    expect(db.getEmployees()).toEqual([]);
  });

  it('CRITICAL: does NOT re-seed evaluations after they are deleted', async () => {
    const { db } = await import('../src/utils/db');
    db.saveEvaluations([]);
    expect(db.getEvaluations()).toEqual([]);
  });

  it('CRITICAL: does NOT re-seed OKRs after they are deleted', async () => {
    const { db } = await import('../src/utils/db');
    // INITIAL_OKRS is intentionally empty [] (no seed OKRs by design)
    // The key behavior: saving [] should persist [] without re-seed attempt
    db.saveOkrs([]);
    expect(db.getOkrs()).toEqual([]);
  });

  it('CRITICAL: does NOT re-seed when array is explicitly set to empty (simulating delete all)', async () => {
    const { db } = await import('../src/utils/db');
    // Simulate the "delete all profiles" scenario
    db.saveProfiles([]);
    // Refresh/re-read simulates page reload
    const reloaded = db.getProfiles();
    expect(reloaded).toEqual([]);
    // And again
    expect(db.getProfiles()).toEqual([]);
  });

  it('re-seeds only when localStorage key is truly absent (null)', async () => {
    const { db } = await import('../src/utils/db');
    const memStorage = (globalThis as any).localStorage as MemoryStorage;
    // Manually delete the key to simulate a fresh key absence
    memStorage.removeItem('pe_profiles');
    const profiles = db.getProfiles();
    expect(profiles.length).toBe(3);
    // Now the key should exist in localStorage
    expect(memStorage.getItem('pe_profiles')).not.toBe(null);
  });

  it('preserves user-added profiles alongside seed data', async () => {
    const { db } = await import('../src/utils/db');
    const seed = db.getProfiles();
    const newProfile = {
      id: 'test-profile-1',
      title: 'Test Profile',
      code: 'TEST-01',
      family: 'Test Family',
      locked: false,
      items: [{ cid: 'crit-s1', weight: 15 }],
    };
    db.saveProfiles([...seed, newProfile]);
    const retrieved = db.getProfiles();
    expect(retrieved.length).toBe(4);
    expect(retrieved.find(p => p.id === 'test-profile-1')?.title).toBe('Test Profile');
  });
});
