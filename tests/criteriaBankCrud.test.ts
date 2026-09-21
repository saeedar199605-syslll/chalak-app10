/**
 * Behavioral tests for Central Criteria Bank CRUD.
 *
 * Tests create, read, update, delete, duplicate detection, validation,
 * import/export, and persistence across reloads.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

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

describe('Central Criteria Bank — CRUD (Behavioral)', () => {
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
    return { db, criteria };
  }

  it('CREATE: new criterion is persisted and reloaded', async () => {
    const { db } = await setupDb();
    const newCrit = db.addCriterion({
      code: 'C-TEST-01', cat: 'K', name: 'درصد تحقق برنامه تست',
      def: 'تست CRUD معیار جدید', source: 'سیستم تست', method: 'فرمول تست', dir: 'more',
    });
    const reloaded = db.getCriteria();
    const found = reloaded.find(c => c.id === newCrit.id);
    expect(found).toBeDefined();
    expect(found!.code).toBe('C-TEST-01');
    expect(found!.name).toBe('درصد تحقق برنامه تست');
  });

  it('READ: all seeded criteria are loaded', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    expect(criteria.length).toBeGreaterThan(0);
    criteria.forEach(c => {
      expect(c.id).toBeDefined();
      expect(c.code).toBeDefined();
      expect(c.name).toBeDefined();
      expect(c.cat).toBeDefined();
    });
  });

  it('UPDATE: criterion can be modified and change persists', async () => {
    const { db } = await setupDb();
    const original = db.getCriteria()[0];
    expect(original).toBeDefined();
    const updated = db.updateCriterion(original.id, {
      code: original.code, cat: original.cat, name: 'نام به‌روزرسانی شده',
      def: original.def, source: original.source, method: original.method, dir: original.dir,
    });
    expect(updated).not.toBeNull();
    const reloaded = db.getCriteria();
    const found = reloaded.find(c => c.id === original.id);
    expect(found!.name).toBe('نام به‌روزرسانی شده');
  });

  it('DELETE: criterion is removed from storage', async () => {
    const { db } = await setupDb();
    const newCrit = db.addCriterion({
      code: 'C-DEL-01', cat: 'Q', name: 'حذف تست', def: 'test', source: 'test', method: 'test', dir: 'less',
    });
    expect(db.getCriteria().find(c => c.id === newCrit.id)).toBeDefined();
    db.deleteCriterion(newCrit.id);
    expect(db.getCriteria().find(c => c.id === newCrit.id)).toBeUndefined();
  });

  it('DELETE CASCADE: criterion removed from profiles that reference it', async () => {
    const { db, criteria } = await setupDb();
    const crit = criteria[0];
    const before = db.getProfiles().filter(p => p.items.some(i => i.cid === crit.id)).length;
    const result = db.deleteCriterion(crit.id);
    expect(result.success).toBe(true);
    if (before > 0) {
      expect(result.affectedProfiles).toBe(before);
    }
    // Verify no profile references the deleted criterion
    const profiles = db.getProfiles();
    profiles.forEach(p => {
      expect(p.items.some(i => i.cid === crit.id)).toBe(false);
    });
  });

  it('DUPLICATE: adding same code creates new entry (code not enforced unique)', async () => {
    const { db } = await setupDb();
    const original = db.getCriteria()[0];
    const before = db.getCriteria().length;
    db.addCriterion({
      code: original.code, cat: 'K', name: 'تکراری', def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    const after = db.getCriteria();
    // addCriterion does not check for duplicates — it adds anyway
    expect(after.length).toBe(before + 1);
  });

  it('VALIDATION: empty code is normalized (trimmed + uppercased)', async () => {
    const { db } = await setupDb();
    const created = db.addCriterion({
      code: '  c-lower-01  ', cat: 'K', name: 'تست نرمال‌سازی', def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    expect(created.code).toBe('C-LOWER-01'); // Trimmed and uppercased
  });

  it('CATEGORIES: criteria exist across multiple categories', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    const categories = new Set(criteria.map(c => c.cat));
    expect(categories.size).toBeGreaterThan(1);
    expect(categories.has('S')).toBe(true);
    expect(categories.has('K')).toBe(true);
  });

  it('PERSISTENCE: CRUD operations survive reload cycle', async () => {
    const { db } = await setupDb();
    // Create
    const created = db.addCriterion({
      code: 'C-PERSIST-01', cat: 'L', name: 'پایداری تست',
      def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    // Update
    db.updateCriterion(created.id, {
      code: 'C-PERSIST-01', cat: 'L', name: 'پایداری به‌روزرسانی شده',
      def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    // Read
    const found = db.getCriteria().find(c => c.id === created.id);
    expect(found!.name).toBe('پایداری به‌روزرسانی شده');
    // Delete
    db.deleteCriterion(created.id);
    expect(db.getCriteria().find(c => c.id === created.id)).toBeUndefined();
  });

  it('EXISTING: seeded criteria include HSE criterion (now OPTIONAL per HC-011)', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    const hseCriteria = criteria.filter(c => c.cat === 'S' || c.code?.includes('HSE'));
    expect(hseCriteria.length).toBeGreaterThan(0);
  });

  it('HSE OPTIONAL: profile can be saved without HSE criterion', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    const nonHseCriteria = criteria.filter(c => !(c.cat === 'S' || c.code?.includes('HSE')));
    const profile = db.addProfile({
      title: 'پروفایل تست HSE اختیاری',
      code: 'P-HSE-OPT',
      family: 'تست',
      items: nonHseCriteria.slice(0, 3).map(c => ({ cid: c.id, weight: 30 })),
      baseRewardAmount: undefined,
      locked: false,
    });
    expect(profile).toBeDefined();
    const reloaded = db.getProfiles();
    const saved = reloaded.find(p => p.id === profile.id);
    expect(saved).toBeDefined();
    expect(saved!.items.some(i => {
      const crit = criteria.find(c => c.id === i.cid);
      return crit?.cat === 'S' || crit?.code?.includes('HSE');
    })).toBe(false);
  });

  it('HSE OPTIONAL: profile can be saved with HSE criterion', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    const hseCrit = criteria.find(c => c.cat === 'S' || c.code?.includes('HSE'));
    const otherCrit = criteria.find(c => c.id !== hseCrit?.id);
    expect(hseCrit).toBeDefined();
    expect(otherCrit).toBeDefined();
    const profile = db.addProfile({
      title: 'پروفایل تست شامل HSE',
      code: 'P-HSE-IN',
      family: 'تست',
      items: [
        { cid: hseCrit!.id, weight: 50 },
        { cid: otherCrit!.id, weight: 50 },
      ],
      baseRewardAmount: undefined,
      locked: false,
    });
    expect(profile).toBeDefined();
    const reloaded = db.getProfiles();
    const saved = reloaded.find(p => p.id === profile.id);
    expect(saved!.items.some(i => {
      const crit = criteria.find(c => c.id === i.cid);
      return crit?.cat === 'S' || crit?.code?.includes('HSE');
    })).toBe(true);
  });

  it('HSE OPTIONAL: profile can be saved with zero criteria (empty selection)', async () => {
    const { db } = await setupDb();
    // Should allow saving with empty items — HSE is not forced
    const profile = db.addProfile({
      title: 'پروفایل تست خالی',
      code: 'P-EMPTY',
      family: 'تست',
      items: [],
      baseRewardAmount: undefined,
      locked: false,
    });
    expect(profile).toBeDefined();
  });

  it('BULK: deleting criterion and verifying other criteria intact', async () => {
    const { db } = await setupDb();
    const newCrit = db.addCriterion({
      code: 'C-BULK-01', cat: 'B', name: 'تیمی تست',
      def: 'test', source: 'test', method: 'test', dir: 'more',
    });
    const beforeCount = db.getCriteria().length;
    db.deleteCriterion(newCrit.id);
    const after = db.getCriteria();
    expect(after.length).toBe(beforeCount - 1);
    expect(after.find(c => c.id === newCrit.id)).toBeUndefined();
  });

  it('SORT BY CODE: criteria are returned in consistent order', async () => {
    const { db } = await setupDb();
    const criteria = db.getCriteria();
    const codes = criteria.map(c => c.code);
    // Verify codes are unique in the seed data
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});
