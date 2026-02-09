# /review-admin — Admin Panel Review

Perform a deep review of the admin panel UI, identifying bugs, UX issues, and improvement opportunities.

## Review Scope

### 1. Component Architecture
Read all admin components and pages:
- `src/pages/AdminDashboardPage.tsx`
- `src/pages/AdminSessionsPage.tsx`
- `src/pages/AdminAssessmentsPage.tsx`
- `src/pages/AdminChatPage.tsx`
- `src/pages/AdminLoginPage.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/components/admin/SessionDrawer.tsx`
- `src/components/admin/AssessmentDrawer.tsx`
- `src/components/admin/ChatMessage.tsx`
- `src/components/admin/ChatInput.tsx`
- `src/components/admin/StatCard.tsx`
- `src/components/admin/StatusBadge.tsx`

### 2. Check For
- **State management**: Proper loading/error states, race conditions
- **Prop types**: All interfaces properly defined, no `any` types
- **Accessibility**: aria labels, keyboard navigation, focus management
- **Responsive design**: Grid breakpoints, mobile layout
- **Error handling**: API failure states, empty states, boundary errors
- **Performance**: Unnecessary re-renders, missing memoization, large lists without virtualization
- **UX consistency**: Matching patterns across all admin pages (cards, tables, drawers)
- **Tailwind patterns**: Consistent use of the dark theme system (bg-white/[0.03], white/opacity text)

### 3. Design System Check
Verify consistent use of:
- Glass-morphism cards: `bg-white/[0.03] rounded-2xl border border-white/10`
- Status colors: green (success), yellow (warning), red (error), blue (info), purple (analyzed)
- Typography: `text-sm`, `text-xs`, `uppercase tracking-wider` for labels
- Spacing: `px-6 py-6`, `gap-4` grid, `space-y-` for vertical rhythm

## Output Format

Group findings by severity:
1. **Bugs** — Things that are broken
2. **UX Issues** — Things that hurt the user experience
3. **Improvements** — Things that could be better
4. **Good Patterns** — Things done well that should be maintained

Use parallel subagents: one for pages, one for components.
