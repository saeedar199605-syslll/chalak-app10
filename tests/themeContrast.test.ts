/**
 * Regression tests for Light/Dark theme contrast and icon readability (Issue 5).
 *
 * Root cause: CriteriaBank.tsx used dark-only Tailwind classes (text-slate-400, 
 * bg-slate-950, etc.) without `dark:` variants or light theme alternatives.
 * The `theme` prop was received but never used for styling.
 *
 * Fix: All UI elements now use theme-aware conditional classes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Criteria Bank — Theme/Contrast Regression', () => {
  const sourcePath = 'src/components/CriteriaBank.tsx';
  const source = readFileSync(sourcePath, 'utf-8');

  it('THEME PROP: component accepts and uses theme prop for styling', () => {
    expect(source).toContain("theme?: 'dark' | 'light'");
    expect(source).toContain("theme = 'dark'");
  });

  it('NO DARK-ONLY COLORS: text-slate-500 not used without theme guard', () => {
    // Find all text-slate-500 usages
    const lines = source.split('\n');
    let darkOnlyCount = 0;
    lines.forEach((line, idx) => {
      if (line.includes('text-slate-500') && !line.includes('theme')) {
        // Check if it's inside a template literal with theme check
        const nearbyLines = lines.slice(Math.max(0, idx - 3), idx + 1).join('\n');
        if (!nearbyLines.includes('theme')) {
          darkOnlyCount++;
        }
      }
    });
    expect(darkOnlyCount).toBe(0);
  });

  it('NO DARK-ONLY BACKGROUNDS: bg-slate-950 not used without theme guard', () => {
    const lines = source.split('\n');
    let darkOnlyCount = 0;
    lines.forEach((line, idx) => {
      if (line.includes('bg-slate-950') && !line.includes('theme') && !line.includes('dark:')) {
        darkOnlyCount++;
      }
    });
    expect(darkOnlyCount).toBe(0);
  });

  it('ICONS: key toolbar icons have theme-aware color classes', () => {
    const importantIcons = ['Layers', 'Calculator', 'Download', 'Search', 'Plus', 'Filter'];
    importantIcons.forEach(iconName => {
      if (source.includes(`<${iconName}`)) {
        // Find the line with this icon
        const iconLine = source.split('\n').find(line => line.includes(`<${iconName}`));
        expect(iconLine).toBeDefined();
        // Icons with explicit text colors should have theme awareness
        if (iconLine && iconLine.includes('text-')) {
          expect(iconLine).toMatch(/theme/);
        }
      }
    });
  });

  it('FORM INPUTS: inputs have light theme variants', () => {
    // All form inputs should have theme-aware classes
    const inputLines = source.split('\n').filter(line => 
      line.includes('className=') && (line.includes('bg-slate-900') || line.includes('bg-slate-950'))
    );
    inputLines.forEach(line => {
      expect(line).toMatch(/theme/);
    });
  });

  it('BUTTONS: action buttons have theme-aware background classes', () => {
    const buttonLines = source.split('\n').filter(line => 
      line.includes('cursor-pointer') && (line.includes('bg-slate-800') || line.includes('bg-slate-900'))
    );
    buttonLines.forEach(line => {
      expect(line).toMatch(/theme/);
    });
  });

  it('LABELS: form labels have theme-aware text classes', () => {
    const labelLines = source.split('\n').filter(line => 
      line.includes('<label') && line.includes('text-slate-')
    );
    labelLines.forEach(line => {
      expect(line).toMatch(/theme/);
    });
  });
});
