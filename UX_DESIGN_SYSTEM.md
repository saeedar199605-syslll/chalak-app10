# UX Design System — Chalak Performance

## Purpose
Design system for the Chalak Performance HR/Performance Management application.
Persian RTL, premium SaaS-inspired, iOS-quality aesthetic.

## Color System (Semantic Tokens)

All colors are defined as CSS variables. Do NOT use raw hex values in components.

| Role | Light Mode | Dark Mode | Variable |
|------|-----------|-----------|----------|
| Primary (actions) | #007AFF | #0A84FF | `--color-primary` |
| Secondary | #F2F2F7 | #1C1C1E | `--color-secondary` |
| Neutral text (primary) | #000000 | #FFFFFF | `--color-text-primary` |
| Neutral text (secondary) | #8E8E93 | #AEAEB2 | `--color-text-secondary` |
| Neutral text (tertiary) | #C7C7CC | #8E8E93 | `--color-text-tertiary` |
| Background (primary) | #FFFFFF | #000000 | `--color-bg-primary` |
| Background (secondary) | #F2F2F7 | #1C1C1E | `--color-bg-secondary` |
| Background (tertiary) | #F9F9F9 | #121212 | `--color-bg-tertiary` |
| Border | #D1D1D6 | #38383A | `--color-border` |
| Success | #30B058 | #30B058 | `--color-success` |
| Warning | #FF9F0A | #FF9F0A | `--color-warning` |
| Danger | #FF3B30 | #FF453A | `--color-danger` |
| Info | #34C759 | #34C759 | `--color-info` |

## Button System

**ONE shared button component.** Variants: Primary, Secondary, Tertiary/Ghost, Danger.

| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| Primary | var(--color-primary) | white | none | opacity: 0.85 |
| Secondary | transparent | var(--color-primary) | 1px solid var(--color-primary) | bg: rgba(0,122,255,0.1) |
| Tertiary/Ghost | transparent | var(--color-text-secondary) | none | bg: rgba(0,0,0,0.05) |
| Danger | transparent | var(--color-danger) | 1px solid var(--color-danger) | bg: rgba(255,59,48,0.1) |

**Normalization:**
- Height: 36px (desktop), 44px (mobile touch)
- Padding: 12px 16px (desktop), 16px 20px (mobile)
- Radius: 8px (consistent across all)
- Font: 14px / 500 weight (Inter or Vazirmatn)
- Icon size: 18px
- Icon gap: 6px
- Focus: 2px ring, offset 2px
- Disabled: opacity 0.4, cursor not-allowed
- Loading: spinner replaces icon, all interactions prevented

## Icon System

- Size: 18px (inline), 24px (toolbar)
- Stroke: 1.5px (consistent)
- Color: `currentColor` (inherit from parent)
- Alignment: vertically centered
- Spacing: 4px gap before text
- Low-contrast icons must use `--color-text-tertiary` or inherit

## Surface & Layout

- Panel radius: 12px
- Border: 1px solid var(--color-border)
- Shadow (elevated): 0 4px 12px rgba(0,0,0,0.08) (light), rgba(0,0,0,0.3) (dark)
- No glassmorphism — performance and readability priority

## Typography

| Element | Size | Weight | Line Height | Persian Font |
|---------|------|--------|-------------|--------------|
| Page title | 28px | 600 | 1.3 | Vazirmatn Bold |
| Section title | 20px | 600 | 1.4 | Vazirmatn SemiBold |
| Card title | 16px | 600 | 1.4 | Vazirmatn SemiBold |
| Body | 15px | 400 | 1.6 | Vazirmatn Regular |
| Secondary text | 14px | 400 | 1.5 | Vazirmatn Regular |
| Caption | 13px | 400 | 1.4 | Vazirmatn Regular |
| Form label | 14px | 500 | — | Vazirmatn Medium |
| Helper text | 13px | 400 | 1.4 | Vazirmatn Regular |
| Error text | 13px | 400 | 1.4 | Vazirmatn Regular |

## Spacing Scale

Base unit: 4px. All spacing multiples of 4.
- 4, 8, 12, 16, 24, 32, 48, 64

## Forms

Every field includes: label, input, helper text (optional), error message (on invalid).

Input height: 36px. Radius: 8px. Border: 1px solid var(--color-border).
Focus: 2px ring var(--color-primary).
Disabled: bg var(--color-bg-tertiary), opacity 0.5.

## Tables

- Header: 40px height, font 13px, weight 600, bg var(--color-bg-secondary)
- Row: 44px height (compact: 36px)
- RTL alignment for Persian content
- Hover: bg var(--color-bg-tertiary)
- Empty state: icon + message + optional action button

## Modals / Dialogs

- Max width: 640px (large: 960px)
- Radius: 12px
- Overlay: rgba(0,0,0,0.4)
- Actions: right-aligned, primary on right, destructive on left
- Close: ESC key, overlay click, X button

## Responsive Breakpoints

- Mobile: < 640px
- Tablet: 640px - 1024px
- Laptop: 1024px - 1440px
- Desktop: 1440px - 1920px
- Large desktop: > 1920px

## RTL

- Direction: `rtl` on root element
- Text-align: right for Persian
- Icons: arrows and directional icons mirrored; symbolic icons (check, close, warning) NOT mirrored
- Form input: text-align right for Persian

## Motion

- Duration: 200ms for ordinary transitions
- Easing: cubic-bezier(0.4, 0, 0.2, 1)
- Respect `prefers-reduced-motion`
- Modal: scale/fade (200ms)
- Dropdown: slide/fade (150ms)
- Tab: underline (200ms)

## Loading / Feedback

- Skeleton: 12px radius, bg var(--color-bg-secondary), animation pulse 1.5s
- Spinner: 18px, 2px stroke
- Success: green checkmark, auto-dismiss 3s
- Error: red X, persistent until dismissed

## Light / Dark Theme

Toggle stored in localStorage. Default: light.
- All components use CSS variables
- Dark theme: `--color-scheme: dark` on root
- Both themes verified for text contrast (≥ 4.5:1 for normal text)

## Accessibility

- Focus rings on all interactive elements
- Semantic HTML (button, a, label, th, td)
- ARIA labels on icon-only buttons
- Alt text on images
- Color not sole indicator of state (icons + text)
- Keyboard navigation (Tab, Enter, Escape)
- Persian screen readers: `lang="fa"` on root
