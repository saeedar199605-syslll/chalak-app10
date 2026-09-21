# System Stabilization Specification

## Architecture Summary
- React 18 SPA + Vite + TypeScript + Tailwind CSS
- Cloudflare Workers (`functions/api/`) with D1 database
- Local storage persistence (`src/utils/db.ts` — AppDatabase class)
- No git repository (not a git repo)

## Baseline Status (B00 Audit Complete)
- TypeScript typecheck: PASS (0 errors)
- Test suite: 87 tests pass (8 test files)
- Production build: PASS
- No git history for regression tracking

## CRITICAL BUGS (Priority 1 — Addressed)

### CRITICAL-01: Job Profiles / Criteria / Employees Auto-Reappear After Deletion
- **Root cause**: In `src/utils/db.ts`, `getProfiles()`, `getCriteria()`, `getEmployees()`, `getEvaluations()`, and `getOkrs()` all used a pattern: `if (!data || data.length === 0)` to re-seed default data. This means when a user deletes ALL profiles (resulting in an empty array `[]`), the next call to `getProfiles()` sees `data.length === 0` and re-seeds `SEED_PROFILES`, making deleted profiles reappear.
- **Fix**: Changed to `if (raw === null)` — only seed when the localStorage key is absent (first run). If the key exists with `[]`, respect the user's deletion. Applied to all five methods.
- **Test**: `tests/dbReseed.test.ts` — 9 tests verifying no re-seed after deletion, seed on first access, and round-trip persistence.

### CRITICAL-02: Job Profile Creation Button Does Nothing ("Inability to Create Profiles")
- **Root cause**: In `src/components/JobProfiles.tsx`, the profile modal form had NO `<form>` wrapper and NO `onSubmit` handler. The "Save Profile" button was `type="submit"` but there was no form to submit to, so clicking it did nothing.
- **Fix**: Wrapped modal content in `<form onSubmit={handleSaveProfile}>`, added `handleSaveProfile` handler that validates inputs (title, code, family required; weights sum to 100; mandatory HSE criterion included), calls `onAddProfile`/`onUpdateProfile`, and closes the modal. Added error message display and a "بدون انتساب" (no assignment) option to the employee profile dropdown.
- **Test**: TypeScript compiles, all 96 tests pass, production build succeeds.

### CRITICAL-03: Employee Profile Dropdown Selection Issue
- **Root cause**: In `src/components/Employees.tsx`, the job profile `<select>` dropdown had no empty/placeholder option. If an employee's `profileId` was empty or referenced a deleted profile, the select value didn't match any option, causing the selection to appear lost on submission.
- **Fix**: Added `<option value="">بدون انتساب</option>` as the first option.

## Safety Section
- **Investigation**: No dedicated "Safety" section/tab exists. Safety is handled via the `S` (HSE) criterion category within the Criteria Bank and Job Profiles. The `MANDATORY_SAFETY_CODE` (B-HSE-01) is enforced in profile weights. Access control is correct — `canAccessTab` properly restricts tabs by role. No fix needed.

## Password / Auth Security
- **Investigation**: Password API (`functions/api/auth/password.ts`) properly checks admin role for all operations, validates input, hashes passwords, uses credential versioning for session invalidation, and returns structured errors without leaking secrets. `callPasswordApi` in `passwordApi.ts` sanitizes error messages to prevent XSS/information leakage. No fix needed.

## Open Issues (Not yet addressed)
- Excel import/export reliability (needs pipeline validation tests)
- Calibration calculation correctness (needs deterministic test cases)
- Financial calculation audit (needs deterministic test cases)
- Backup/restore validation (needs testing)
- Storage monitoring
- Onboarding/help system redesign
- Performance optimization
- Multi-user/realtime consistency testing
