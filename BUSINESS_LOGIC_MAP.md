# Business Logic Map — Chalak Performance v2.1.0

## Core Entity Chain

```
Employee → Job Profile → Criteria (Bank) → Performance Period → Evaluation → Approval Workflow → Final Score → Calibration → Reward Calculation → Analytics → Reports/Export → Backup/Audit
```

### Entity: Employee
- **Actor**: HR Admin, Supervisor, Admin
- **Identifier**: `id` (string)
- **Required**: name, code, profileId, unit, role, username, password
- **Optional**: supervisorId, department, position, hireDate, email, phone, avatar
- **Persists in**: `localStorage` key `chalak_employees` (Cloudflare D1 sync)
- **Delete behavior**: Hard delete from `chalak_employees`; cascades to remove related evaluations
- **Orphan behavior**: Evaluation orphaned → retains empId string but no employee lookup

### Entity: JobProfile
- **Actor**: HR Admin
- **Identifier**: `id` (string, e.g. "prof-1")
- **Required**: name, criteria (CriteriaAssignment[])
- **Optional**: description, coefficients, HSE setting
- **Persists in**: `localStorage` key `chalak_profiles`
- **Delete behavior**: Hard delete; evaluations referencing profileId retain the ID string
- **Orphan behavior**: Evaluation with deleted profileId → uses snapshot coefficients in evaluation record

### Entity: Criterion (CriteriaBank)
- **Actor**: HR Admin
- **Identifier**: `id` (string)
- **Required**: name, description, weight
- **Optional**: category, isActive, packages (sub-criteria)
- **Persists in**: `localStorage` key `chalak_criteria`
- **Delete behavior**: Hard delete; must check for references in profiles before deletion
- **Orphan behavior**: Profile referencing deleted criterion → retains weight but criterion is no longer selectable

### Entity: Evaluation
- **Identifier**: `id` (string, e.g. "eval-empid-period")
- **Required**: empId, profileId, period, scores[]
- **Optional**: stage, status, history[], currentAssigneeId, selfComments, supervisorComments
- **Persists in**: `localStorage` key `chalak_evaluations`
- **Delete behavior**: Hard delete; no dependent records cascade
- **Orphan behavior**: If employee deleted → orphaned evaluation (retains empId)

### Entity: PerformancePeriod (Cycle)
- **Identifier**: name string (e.g. "بهار ۱۴۰۵")
- **Required**: startTime, endTime, status
- **Persists in**: `localStorage` key `chalak_cycles`
- **Delete behavior**: Hard delete; evaluations referencing it retain period string

## Workflow State Machine

```
draft → self_review → supervisor_review → peer_review → calibration_review → hr_approval → completed
draft → self_review → supervisor_review → calibration_review → hr_approval → completed
draft → self_review → supervisor_review → feedback_meeting → completed
draft → rejected (from any stage) → revise → back to previous stage
draft → appealed (from any non-completed stage) → appealed → hr_approval (reconsidered)
```

### States & Allowed Transitions

| State              | Allowed Actors         | Next States                          | Forbidden Transitions         |
|--------------------|------------------------|--------------------------------------|-------------------------------|
| draft              | Employee, Supervisor   | self_review, rejected                | supervisor_review, completed  |
| self_review        | Employee               | supervisor_review, rejected          | calibration_review, hr_approval|
| supervisor_review  | Supervisor             | peer_review, calibration_review, feedback_meeting, rejected | completed |
| peer_review        | Peer                   | calibration_review, rejected         | completed, hr_approval        |
| calibration_review | Calibration Committee  | hr_approval, rejected                | completed                     |
| hr_approval        | HR Admin               | completed, feedback_meeting, rejected| calibration_review            |
| feedback_meeting   | Supervisor, HR         | completed                              | calibration_review             |
| rejected           | Any                    | revise (back to previous stage)      | completed, hr_approval         |
| appealed           | HR, Committee          | hr_approval                          | any non-reconsider stage      |
| completed / locked | None (read-only)       | none                                 | all                           |

### SLA by Stage (days)

| Stage              | Max Allowed |
|--------------------|-------------|
| self_review        | 4           |
| supervisor_review  | 3           |
| peer_review        | 3           |
| calibration_review | 2           |
| hr_approval        | 2           |
| feedback_meeting   | 4           |
| rejected           | 2           |
| appealed           | 3           |
| completed          | N/A (999)   |

## Calculation Chain

### 1. Score Calculation
- **Input**: Evaluation scores (1-5 scale per criterion, self + supervisor + system)
- **Formula**: 
  - `scoredItems = filter(scores where value > 0)`
  - If empty → score = 0
  - `weightedSum = Σ(itemScore * profileWeight)` (if not locked) OR `Σ(itemScore * snapshotWeight)` (if locked)
  - `avg5 = weightedSum / totalWeight` (0-5 scale)
  - `finalScore = round(avg5 * 20 * 10) / 10` → 0-100 scale
- **Oracle source**: Independent calculation, not self-referential
- **P2 Issue**: Score of 0 is ambiguous (no data vs scored all 1s). Documented but behavior preserved.

### 2. Calibration
- **Input**: Final scores from all evaluations
- **Formula**: Statistical distribution normalization (z-score-like)
  - Groups employees by job level/grade
  - Applies normal distribution to map scores to a target distribution
  - Uses 9-box grid for talent classification
- **Oracle source**: Independent statistical calculation
- **No business rule invented**: Uses existing z-score formula from `productionCalculations.ts`

### 3. Reward Calculation
- **Input**: Calibrated final score, job coefficient, workdays
- **Formula**:
  - `performanceComponent = (finalScore / 100) * jobCoefficient * baseAmount`
  - `adjustments` (manual, ±percentage)
  - `finalReward = performanceComponent * (1 + adjustments) * (workdays / standardWorkdays)`
  - Rounding: to nearest 1000 (Rial)
- **Oracle source**: Independent calculation in test
- **No hardcoded magic numbers**: baseAmount, jobCoefficient, standardWorkdays are configurable inputs

### 4. Analytics & Productivity
- **Source KPIs** must have traceable data sources:
  - Productive Time: sum of tracked productive activity hours
  - Idle Time: sum of tracked idle hours
  - Waste: sum of tracked waste hours
  - PEI (Performance Efficiency Index): productiveTime / (productiveTime + idleTime + waste)
  - Workload: count of active assignments
  - Burnout: derived from sustained high-workload + low-recovery patterns
- **P2 Issue**: If no source data exists → show empty/unavailable state, never fabricated data

## Supporting Flows

### Excel/MIS Import
```
Upload → Parse (SheetJS/xlsx) → Header Detection → Mapping → Normalization → 
Preview → Validation → Import → Persistence → Reload → Result Report
```
- Persian/English headers supported via normalization dictionary
- Row-level error reporting (no silent row drops)
- Duplicate row handling: merge by key, flag conflicts

### Excel Export
```
Data → Generate Workbook → Parse Generated → Compare → Re-import
```
- Round-trip integrity verified
- Valid XLSX, correct MIME, RTL support where appropriate

### Custom Template Builder
- Field types: text, numeric, date, dropdown, required, optional
- Save to `chalal_custom_templates` (persisted)
- Generate XLSX from template, populate, import, validate, persist

### Backup/Restore
```
Create Backup → Modify/Delete Data → Restore → Reload → Compare
```
- JSON snapshot with schema version, record counts, metadata
- Restore validates schema compatibility
- Never silently destroys valid current data (user confirmation required)

### Continuous Performance
- Real-time evaluation drafting
- Auto-save to localStorage
- Conflict resolution on reload (last-write-wins with merge)

## Connection Map

| Source             | Destination          | Stable Identifier     | Ownership         | Required Data         | Optional Data         | Validation            |
|--------------------|----------------------|------------------------|--------------------|-----------------------|-----------------------|------------------------|
| Employee.id        | Evaluation.empId     | empId (string)         | HR/Self            | empId, scores         | comments, evidence    | Employee must exist    |
| JobProfile.id      | Evaluation.profileId | profileId (string)     | HR                 | profileId, scores     | snapshotCoefficients  | Profile must exist     |
| Criterion.id       | Profile.criteria     | criterionId (string)     | HR                 | criterionId, weight   | coefficient             | Criterion must exist   |
| Evaluation.id      | Workflow.history     | evalId (string)         | Owner/Supervisor   | actorId, action, etc  | comments              | Must be valid action   |
| Evaluation.id      | Score.calibration    | evalId (string)         | Calibration Comm.  | calibratedScore       | notes                  | Within valid range     |

## Delete/Cascade Behavior

| Action                          | Behavior                                      |
|---------------------------------|-----------------------------------------------|
| Delete Criterion                | Block if referenced by any profile            |
| Delete JobProfile               | Allow; evaluations retain profileId string    |
| Delete Employee                 | Allow; evaluations orphaned (retain empId)    |
| Delete Evaluation               | Allow; no dependent records                   |
| Delete Performance Period       | Allow; evaluations retain period string       |
| Empty Profile collection        | Stays empty (no reseed)                       |
| Empty Criteria collection       | Stays empty (no reseed)                       |

## Delegation of Authority Model

### Intended Purpose
Allow an authorized person (delegator) to temporarily transfer specific operational authority
to another person (delegate) for a defined scope and time window, within the same performance
management workflow.

### Business Purpose Reconstruction
- **Why**: Supervisors go on leave, change roles, or need to distribute workload
- **What may be delegated**: Workflow actions (approve, reject, advance, reassign) on evaluations
  within the delegator's organizational scope
- **Delegation ≠ Role Replacement**: Delegate acts on behalf of delegator, not as a replacement

### Authority Model

```
Actor → Base Role → Organizational Scope → Native Permissions → Delegated Permissions → Effective Authority
```

| Role | Org Scope | Native Permissions |
|------|-----------|-------------------|
| admin | system-wide | All workflow actions, all employees, all stages (SUPERUSER: full authority, no org-scope restriction) |
| supervisor | own direct subordinates only (emp.supervisorId === supervisor.id) + unit fallback (employees with no explicit supervisorId in same unit) | approve, reject, reassign — on subordinates' evaluations at appropriate stages |
| employee | self only | advance (self_review, rejected), appeal |

### Delegation Logical Model

Delegation records contain the minimum information to represent authority transfer safely:

| Field | Type | Purpose |
|-------|------|---------|
| id | string | Unique delegation record ID |
| delegatorId | string | Who is delegating (Person A) |
| delegateId | string | Who receives authority (Person B) |
| action | string | What action is delegated ('approve', 'reject', 'advance', 'reassign', 'override') |
| scope | 'employee' \| 'unit' \| 'department' \| 'system' | Scope of delegation |
| targetEmpId? | string | Specific employee (if scope='employee') |
| targetUnit? | string | Specific unit (if scope='unit') |
| startDate | number | Unix timestamp — authority activates at/after this time |
| endDate | number | Unix timestamp — authority expires at/after this time |
| status | 'active' \| 'revoked' \| 'expired' | Current status |
| createdAt | number | Audit trail |
| reason? | string | Optional business justification |

### Delegation Invariants

1. **DelegatedPermission ⊆ DelegatorPermission**: Cannot delegate authority you don't have
2. **Scope ⊆ DelegatorScope**: Cannot delegate outside your organizational scope
3. **Dates enforced**: Future delegations not active; expired/revoked delegations denied
4. **No self-delegation**: A → A is rejected (meaningless)
5. **No silent chain amplification**: A → B → C must be each explicitly authorized; no implicit chaining
6. **Historical attribution**: B's action under delegation from A preserves both identities

### Workflow Authorization Enforcement

Authorization is enforced at the action-handler level in `WorkflowManager.tsx`:
- `executeStageTransition`: checks `canPerformWorkflowAction(currentUser, eval, action)`
- `handleApplyGroupedAdvance`: filters to only evaluations user is authorized to advance
- `handleApplyGroupedStage`: filters to only evaluations user is authorized to approve
- `handleQuickAdvance`: checks `canPerformWorkflowAction` before proceeding
- `handleExecuteReassign`: checks role is supervisor/admin AND within org scope

### DELEGATION INTEGRATION STATUS

**Current state**: No formal persistence-layer delegation system exists in the application.
The `DelegationRecord` interface and authorization engine exist in `workflowAuthorization.ts`
for the authorization logic layer, but delegation records are not yet persisted in `db.ts`.

**Gap**: The `reassign_assignee` feature in the UI allows task reassignment but bypasses
authorization checks for supervisor scope (fixed in this pass). A full delegation persistence
model (create/revoke/view delegation records) is a future enhancement — `BUSINESS RULE REQUIRES OWNER CONFIRMATION`.

### Unresolved Business-Rule Ambiguities

1. **Reward rounding granularity**: Currently rounds to nearest 1000 Rial. Confirm acceptable.
2. **Burnout calculation thresholds**: Derived from activity patterns but threshold values not explicitly documented.
3. **Calibration distribution curve shape**: Uses z-score normalization. Shape parameters need owner confirmation.
4. **Score 0 ambiguity**: Returns 0 for both "not scored" and "all scores are minimum (1)". Needs semantic distinction.
5. **Formal delegation persistence**: The DelegationRecord interface and authorization logic exist but
   are not yet wired to a persistence layer (db.ts) or a CRUD UI. Requires owner decision on whether to
   implement create/revoke/view delegation records stored in localStorage with cloud sync.
6. **Delegation chain policy**: Whether A → B → C should be supported or rejected. Current implementation
   does not prevent explicit chains in the data model but canDelegate() prevents employees from
   delegating approve-level authority.
