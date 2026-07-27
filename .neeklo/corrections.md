# Corrections Log

## 2026-06-25 — Fixed non-responsive `col-span-*` values across grid layouts

**What was wrong:** Several pages used fixed `col-span-*` values (e.g. `colSpan={3}`, `col-span-3`, `col-span-4`) on grid items without responsive breakpoints. On narrow viewports, these caused the grid to not wrap properly, potentially creating horizontal scroll or overlapping content at ~966-694px viewport width.

**Why it happened:** The original col-span values were written with only the desktop layout in mind, without considering how CSS grid handles large column spans at small viewport widths.

**Fix:** Replaced all fixed col-span values with responsive ones across DashboardPage and OutreachHubPage:
- Metric/summary stat cards: `col-span-3` → `col-span-12 sm:col-span-6 lg:col-span-3`
- HeroNumbersCard: kept `col-span-12 lg:col-span-8` (already responsive)
- QuickActionsCard: kept `col-span-12 sm:col-span-6 lg:col-span-4` (already responsive)
- Row 3 cards (LeadPipelineCard, TopCompaniesCard, RecentActivityCard): `col-span-4` → `col-span-12 sm:col-span-6 lg:col-span-4`
- Campaign grid cards: `col-span-4` → `col-span-12 sm:col-span-6 lg:col-span-4`
- Company grid cards on OutreachHubPage: `col-span-3` → `col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3`

**Result:** Grid items now properly wrap to full width on mobile (1 col), 2 columns on tablet, and 3-4 columns on desktop. No horizontal scroll from over-stretched grid items.

**Files affected:** `src/pages/DashboardPage.tsx`, `src/pages/OutreachHubPage.tsx`

## 2026-06-25 — OutreachHubPage now renders without AppShell (no double layout)

**What was wrong:** The `/outreach` route wrapped `OutreachHubPage` inside `<AppShell>`, but the page has its own full-page layout (`min-h-screen`, sticky `header`). This created a double layout with two sticky headers and doubled whitespace.

**Why it happened:** The route was originally set up generically with `AppShell` for all pages, but `OutreachHubPage` was later redesigned as a self-contained layout page without removing the wrapper.

**Fix:** Removed `<AppShell>` wrapper from the `/outreach` route in `App.tsx`, rendering `<OutreachHubPage />` standalone.

**Result:** The page now renders with its own single sticky header and full-page layout. No more double header or layout duplication when navigating to `/outreach`.

**Files affected:** `src/App.tsx`