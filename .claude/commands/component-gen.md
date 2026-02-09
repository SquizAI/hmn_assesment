# /component-gen — Generate Admin Component

Generate a new admin component following the HMN Cascade design system and patterns.

## Usage
`/component-gen <ComponentName>` — Generate a component with the given name
`/component-gen` — Ask what component to create

## Design System Reference

Before generating, read existing components to match patterns:
- `src/components/admin/StatCard.tsx` — Simple display component
- `src/components/admin/StatusBadge.tsx` — Inline badge component
- `src/components/admin/SessionDrawer.tsx` — Slide-out drawer pattern
- `src/components/admin/ChatMessage.tsx` — Complex rendering component
- `src/components/admin/AdminLayout.tsx` — Layout wrapper

### Style Tokens
- **Card**: `bg-white/[0.03] rounded-2xl border border-white/10 p-6`
- **Hover card**: Add `hover:bg-white/[0.04] cursor-pointer transition-colors`
- **Header text**: `text-sm font-semibold text-white/60 uppercase tracking-wider`
- **Body text**: `text-sm text-white/80`
- **Muted text**: `text-xs text-white/40`
- **Input**: `bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors`
- **Button primary**: `bg-blue-500/15 border border-blue-500/20 text-blue-300 rounded-lg px-4 py-2 text-sm hover:bg-blue-500/25 transition-all`
- **Button ghost**: `bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2 text-sm text-white hover:bg-white/[0.08] transition-colors`
- **Gradient bars**: `bg-gradient-to-r from-{color}-500 to-{color}-600`

### Component Pattern
```tsx
interface Props {
  // Typed props — no `any`
}

export default function ComponentName({ ...props }: Props) {
  // hooks at top
  // handlers
  // conditional returns (loading, empty states)
  // main return with Tailwind classes
}
```

## Steps

1. Ask the user what the component should do
2. Read 2-3 similar existing components for pattern matching
3. Generate the component with:
   - TypeScript interface for props
   - Proper hook usage
   - Loading and empty states
   - Dark theme Tailwind styling matching the design system
   - Keyboard accessibility (Escape to close for modals/drawers)
4. Write to `src/components/admin/<ComponentName>.tsx`
5. Show the user the component and suggest where to integrate it
