# UI/UX Changelog

## Round 2 — Owner Manual Testing Fixes

### Screen: Excel Import (UniversalDataExchange)

**Previous Problem**: File input only accepted `.csv,.txt,.json`. XLSX files
were read as raw text via `FileReader.readAsText` and parsed as CSV (comma-split),
producing garbage from binary workbooks.

**Files Changed**:
- `src/components/UniversalDataExchange.tsx`

**Components Changed**:
- `handleFileUpload`: Added `.xlsx` to accept attribute. Added file-type
  detection — `.xlsx` files route through `readWorkbookRows()` (ExcelJS real
  cell parsing) instead of `readAsText` + `parseCSVContent`.

**Responsive Changes**: N/A (file upload is a single input)

**Functional Changes**:
- `.xlsx` files now parse as real workbook cells
- Headers detected from actual cell values
- Columns preserved as separate entities
- Commas inside cells remain one cell

**Verification**: `tests/excelImportFix.test.ts` — 5 tests PASS

---

### Screen: Criteria Import (MultiSourceCriteriaImportModal)

**Previous Problem**: Same CSV-parsing bug as UniversalDataExchange. File
input did not accept `.xlsx`.

**Files Changed**:
- `src/components/MultiSourceCriteriaImportModal.tsx`

**Components Changed**:
- `handleFileUpload`: Added `.xlsx` to accept attribute. Added file-type
  detection — `.xlsx` routed through `readWorkbookRows()`.
- `MultiSourceInputFile` type: Added `'xlsx'` to format union.

**Verification**: `tests/excelImportFix.test.ts` — covers criteria import path

---

### Screen: Navigation/Settings (App.tsx)

**Previous Problem**: Non-admin users navigating to `settings` tab caused a
complete render crash. The component used `<Lock>` icon which was never imported
(only `LockKeyhole` from lucide-react was imported).

**Files Changed**:
- `src/App.tsx`

**Components Changed**:
- Non-admin settings view: Changed `<Lock>` to `<LockKeyhole>`

**Functional Changes**:
- Non-admin users can now see the settings access-denied screen without crash

**Verification**: `tests/navigationCrash.test.ts`, `tests/routeSmoke.test.ts`

---

### Screen: Workflow Manager — Route Configuration

**Previous Problem**: Batch supervisor/approver assignment read from
`localStorage.getItem('pe_employees')` instead of the `employees` prop. In
cloud-synced environments, this caused assignments to operate on stale data
or fail silently for employees not in localStorage.

**Individual matrix onChange**: Same issue — read from localStorage instead
of in-memory state.

**Files Changed**:
- `src/components/WorkflowManager.tsx`

**Components Changed**:
- `handleExecuteBatchAssign`: Uses `employees` prop directly (cloud-synced state)
- Individual matrix `onChange`: Added fallback to `employees` prop when employee
  not found in localStorage

**Functional Changes**:
- Batch assignments operate on current state, not stale localStorage
- Individual matrix edits persist correctly even when employee not in localStorage

**Verification**: Covered by existing workflow tests + clean-room verification

---

### Screen: Workflow Action Mapping

**Previous Problem**: Unknown action strings defaulted to `'approve'` (most
privileged action) instead of a safe least-privilege fallback.

**Files Changed**:
- `src/components/WorkflowManager.tsx`

**Components Changed**:
- `executeStageTransition`: Changed fallback from `'approve'` to `'advance'`

**Security**: Prevents privilege escalation via unknown action strings

---

### Screen: Excel Templates

**Previous Problem**: `downloadEmployeeExcelTemplate()` and
`downloadCriteriaExcelTemplate()` generated comma-separated text templates
in a single column, not real workbooks with separate cells.

**Files Changed**:
- `src/utils/excelImportExport.ts`

**Components Changed**:
- `downloadEmployeeExcelTemplate`: Rewrote to use ExcelJS `workbook.xlsx.writeBuffer()`
  with proper 7-column layout in separate cells
- `downloadCriteriaExcelTemplate`: Rewrote to use ExcelJS with proper 7-column
  layout in separate cells

**Verification**: Clean-room verification + ExcelIntegrationCenter tests

---

### Icon Audit

**Status**: No icon changes this round. The `<Lock>` → `<LockKeyhole>` fix
resolves the only undefined icon reference found. Full icon audit pending
in a future round if owner requests visual redesign.

---

## Round 1 — Baseline

(Existing UI/UX work from prior round — see PREVIOUS_UI_UX_CHANGELOG.md)
