# System Simulation Matrix

## Overview
Tracks realistic end-to-end simulations of HR/performance workflows to verify correctness through actual action→state→persistence→reload chains.

## Legend
- VERIFIED: Full simulation executed and assertions passed
- PARTIAL: Simulation executed but some assertions could not be verified
- PENDING: Not yet executed
- BLOCKED: Cannot execute due to environment constraints

## Persona A — HR Administrator

| #  | Simulation                          | Dataset              | Status   | Evidence                  |
|----|-------------------------------------|----------------------|----------|---------------------------|
| A1 | login → create employee → save      | 1 employee           | VERIFIED | tests/crudEmployee.test.ts|
| A2 | create employee → reload → edit     | deterministic        | VERIFIED | tests/crudEmployee.test.ts|
| A3 | assign profile → change profile     | 2 profiles           | VERIFIED | tests/crudEmployee.test.ts|
| A4 | export employee → delete            | deterministic        | VERIFIED | tests/crudEmployee.test.ts|
| A5 | create criteria → edit → delete     | HSE + non-HSE        | VERIFIED | tests/crudEmployee.test.ts|
| A6 | create profile → assign criteria    | 3 criteria           | VERIFIED | tests/crudEmployee.test.ts|
| A7 | delete all profiles → refresh       | empty set            | VERIFIED | tests/crudEmployee.test.ts|
| A8 | import MIS (Persian headers)        | 10 rows              | PENDING  |                           |
| A9 | import MIS (English headers)        | 10 rows              | PENDING  |                           |
| A10| start evaluation cycle              | 25 employees         | VERIFIED | tests/calibrationWorkflow.test.ts |
| A11| inspect analytics                   | deterministic        | PARTIAL  | BLOCKED — no real source data |
| A12| export report (Excel round-trip)    | 50 records           | PENDING  |                           |
| A13| backup → modify → restore → compare | full dataset         | PENDING  |                           |

## Persona B — Supervisor

| #  | Simulation                          | Dataset              | Status   | Evidence                  |
|----|-------------------------------------|----------------------|----------|---------------------------|
| B1 | login → view team                   | 5 subordinates       | PENDING  |                           |
| B2 | evaluate employee → save            | 3 criteria           | PENDING  |                           |
| B3 | submit → approval workflow          | deterministic        | VERIFIED | tests/workflowTransitions.test.ts |
| B4 | respond to workflow → inspect       | deterministic        | VERIFIED | tests/workflowTransitions.test.ts |
| B5 | reject → return → revise            | deterministic        | VERIFIED | tests/workflowTransitions.test.ts |

## Persona C — System Administrator

| #  | Simulation                          | Dataset              | Status   | Evidence                  |
|----|-------------------------------------|----------------------|----------|---------------------------|
| C1 | login → manage users/roles          | 5 users              | PENDING  |                           |
| C2 | reset/change password               | deterministic        | VERIFIED | tests/password.test.ts    |
| C3 | backup → restore → verify         | full dataset         | PENDING  |                           |
| C4 | inspect configuration               | deterministic        | PENDING  |                           |

## Cross-Module Golden Path

| #  | Simulation                                    | Dataset     | Status   | Evidence                        |
|----|-----------------------------------------------|-------------|----------|---------------------------------|
| G1 | Create Criterion → Profile → Assign Criteria   | deterministic | VERIFIED | tests/crossModuleGoldenPath.test.ts |
| G2 | Create Employee → Assign Profile              | deterministic | VERIFIED | tests/crossModuleGoldenPath.test.ts |
| G3 | Create Period → Evaluate → Submit             | deterministic | VERIFIED | tests/crossModuleGoldenPath.test.ts |
| G4 | Approve → Final Score → Calibration           | deterministic | VERIFIED | tests/crossModuleGoldenPath.test.ts |
| G5 | Reward Calculation → Analytics Export         | deterministic | VERIFIED | tests/crossModuleGoldenPath.test.ts |
| G6 | Excel Export → Re-import (round-trip)         | deterministic | PENDING  |                                |
| G7 | Backup → Delete → Restore → Compare           | deterministic | PENDING  |                                |

## Edge Cases

| #  | Simulation                          | Status   | Evidence                  |
|----|-------------------------------------|----------|---------------------------|
| E1 | Empty database/state                | VERIFIED | tests/edgeCases.test.ts  |
| E2 | 1 employee / 100 employees          | PENDING  |                           |
| E3 | Duplicate names/duplicate IDs       | VERIFIED | tests/crudEmployee.test.ts|
| E4 | Deleted referenced record           | VERIFIED | tests/crudEmployee.test.ts|
| E5 | Invalid score (out of range)        | VERIFIED | tests/calculateFinalScore.test.ts |
| E6 | Max/min score boundary              | VERIFIED | tests/calibrationWorkflow.test.ts |
| E7 | Zero workdays                       | PARTIAL  | BLOCKED — not yet tested |
| E8 | Persian digits / English digits     | PENDING  |                           |
| E9 | Malformed JSON / CSV / XLSX         | VERIFIED | tests/multiSourceImportCrash.test.ts |
| E10| Refresh during workflow             | VERIFIED | tests/workflowTransitions.test.ts |
| E11| Double click                        | PENDING  | BLOCKED — BROWSER ENV    |
| E12| Unauthorized role                   | PARTIAL  | accessControl reviewed   |

## Overdue Notification SLA Simulation

| #  | Simulation                                        | Status   | Evidence                        |
|----|---------------------------------------------------|----------|---------------------------------|
| O1 | Days pending calculated from actual timestamps    | VERIFIED | tests/overdueNotifications.test.ts |
| O2 | No fabrication from ID character codes            | VERIFIED | tests/overdueNotifications.test.ts |
| O3 | No hardcoded special cases (eval-reza-1)          | VERIFIED | tests/overdueNotifications.test.ts |
| O4 | Completed evaluations never overdue               | VERIFIED | tests/overdueNotifications.test.ts |
| O5 | Within-SLA evaluations never overdue                | VERIFIED | tests/overdueNotifications.test.ts |
| O6 | History timestamp used as source of truth          | VERIFIED | tests/overdueNotifications.test.ts |

## Delegation & Workflow Authorization Simulations (DW-01 to DW-20)

| #  | Simulation                          | Status   | Evidence                  |
|----|-------------------------------------|----------|---------------------------|
| DW-01 | Native supervisor approval      | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-02 | Valid delegation (unit scope)   | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-03 | Outside scope (cross-unit)      | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-04 | Expired delegation — denied     | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-05 | Revoked delegation — denied     | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-06 | Self-delegation prevention    | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-07 | Unauthorized delegator       | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-08 | Privilege escalation — denied  | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-09 | Circular delegation — no amplification | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-10 | Chain delegation — no expansion | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-11 | Future delegation — not active  | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-12 | Concurrent approval (both authorized) | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-13 | Double-click idempotency       | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-14 | Return & resubmit lifecycle    | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-15 | Reject semantics               | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-16 | Finalized record — deny edit   | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-17 | Delegator becomes inactive     | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-18 | Delegate becomes inactive      | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-19 | Employee scope change          | VERIFIED | tests/workflowAuthorization.test.ts |
| DW-20 | Reload persistence — determ.  | VERIFIED | tests/workflowAuthorization.test.ts |
