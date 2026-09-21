/**
 * NEW-NAV-01: Navigation crash regression — verifies that all icon references
 * in App.tsx are properly imported.
 *
 * Root cause: App.tsx used <Lock> (not imported) instead of <LockKeyhole>,
 * crashing the non-admin settings view.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// All icons imported in App.tsx line 25-50 (from lucide-react)
const APP_TSX_ICONS = new Set([
  'UploadCloud', 'Home', 'BookOpen', 'Sun', 'Moon', 'ShieldCheck', 'Activity',
  'Sparkles', 'Users', 'Monitor', 'Eye', 'LogOut', 'Menu', 'Download',
  'Printer', 'RotateCcw', 'LockKeyhole', 'Scale', 'ClipboardCheck',
  'FileSpreadsheet', 'Save', 'HelpCircle', 'Bell', 'BellOff', 'RefreshCw',
]);

describe('NEW-NAV-01: Navigation crash regression — icon import verification', () => {
  it('VALIDATE: App.tsx does not reference unimported <Lock> icon (crash bug)', () => {
    const content = readFileSync(join(__dirname, '../src/App.tsx'), 'utf-8');
    // <Lock> without the "Keyhole" suffix was the crash bug
    // Regex: <Lock followed by something that is NOT Keyhole
    const lockUsages = content.match(/<Lock[^K]/g);
    // <LockKeyhole> is fine; <Lock className=...> would be the old bug
    expect(lockUsages).toBeNull();
  });

  it('VALIDATE: All icon components used in App.tsx are from the import set', () => {
    const content = readFileSync(join(__dirname, '../src/App.tsx'), 'utf-8');
    // Find all JSX icon references like <SomeIcon />
    const iconPattern = /<([A-Z][a-zA-Z]+)[^>]*\/>/g;
    const used = new Set<string>();
    let match;
    while ((match = iconPattern.exec(content)) !== null) {
      const iconName = match[1];
      // Skip non-icon components
      const nonIcons = ['div', 'span', 'input', 'button', 'header', 'main', 'nav', 'aside', 'form', 'label', 'option', 'select', 'textarea', 'Suspense', 'ErrorBoundary', 'Error'];
      if (nonIcons.includes(iconName)) continue;
      used.add(iconName);
    }
    // Every used icon should be in the import set
    const reactComponents = ['Login', 'SupervisorNotificationBell', 'Dashboard', 'WorkflowManager', 'CriteriaBank', 'JobProfiles', 'Employees', 'Evaluations', 'Calibration', 'Reports', 'SupportTickets', 'Onboarding', 'MyEvaluation', 'ManagementCenter', 'RewardCalculationCenter', 'LatticePerformanceHub', 'KickidlerProductivityHub', 'ComprehensiveManualModal', 'UniversalDataExchange'];
    const missing = [...used].filter(icon => !APP_TSX_ICONS.has(icon) && !reactComponents.includes(icon));
    expect(missing).toEqual([]);
  });
});
