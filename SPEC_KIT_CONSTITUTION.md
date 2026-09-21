# Spec Kit — Constitution

## Purpose
This document establishes the governing principles for the Chalak Performance System stabilization effort.

## Architecture
- **Frontend**: React 18 SPA built with Vite, TypeScript, Tailwind CSS
- **Backend**: Cloudflare Workers (`functions/api/`) with D1 database binding
- **Local Storage**: Primary persistence layer for application data (profiles, criteria, employees, evaluations)
- **State Sync**: intra-app db.subscribe + cross-tab localStorage storage event
- **Build**: Vite → dist/ (production build succeeds)

## Governing Principles

### CRITICAL ENGINEERING RULES
1. Never "fix" a bug by hiding it. Examples of forbidden fake fixes:
   - Hiding a broken button
   - Returning success without persistence
   - Hardcoding dashboard values
   - Suppressing exceptions
   - Removing failing tests
   - Bypassing permissions
   - Silently ignoring invalid Excel rows
2. Fix the ROOT CAUSE, not the symptom.
3. Preserve all working functionality. No full rewrites unless technically necessary.
4. Every requirement must map: Requirement → Implementation → Test → Result

### PRIORITY ORDER
1. Data integrity
2. Security
3. Calculation correctness
4. Authentication/authorization
5. Core workflows
6. Import/export correctness
7. Backup/recovery
8. Functional correctness
9. Regression safety
10. Performance
11. UX
12. Cosmetics

### TESTING
- Unit tests: business logic, formulas, normalization, mapping
- Integration tests: API + DB + permissions
- E2E tests: critical user workflows
- Every batch is NOT complete until its tests pass
- Rerun affected regression tests when changes affect previous batches

### SECURITY
- Every protected API must enforce permissions server-side
- Frontend hiding is NOT authorization
- Never expose secrets to frontend code
- API errors must be structured (code, message, details, field errors)
- Never leak stack traces or internal sensitive data to users

### CLOUDFLARE COMPATIBILITY
- No Node-only APIs incompatible with Cloudflare Workers runtime
- D1 bindings, environment variables, secrets properly used
- Serverless function handlers follow onRequest pattern

### DEFINITIONS
- DO NOT inject demo/fake data into production automatically
- Seed operations must be explicit and environment-aware
- Do NOT delete user data during cleanup unless backed up
- Empty datasets must show explicit "insufficient/no data" state
