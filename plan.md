# Plan: Unified AI Assessment Builder

## Problem
Assessment creation is fragmented across 3 places:
- "Upload File" button on Assessments page (fire-and-forget, no conversation)
- "AI Builder" button → navigates to generic AdminChatPage (no file upload, general-purpose chat)
- "AI Edit" tab in drawer (scoped to existing assessment only)

The user wants **one unified place** where they can upload context (MD files from Codex, docs, etc.) and conversationally build assessments from that context.

## Solution: Rebuild AdminChatPage → Assessment Builder

Replace the generic AdminChatPage with a purpose-built **Assessment Builder** that combines file upload + conversational AI into one intuitive flow.

---

### Changes

#### 1. New server endpoint: `POST /api/admin/chat` (enhanced)
**File: `server/index.ts`**

- Accept optional `attachments` array alongside `messages`:
  ```json
  { "messages": [...], "attachments": [{ "filename": "guide.md", "content": "..." }] }
  ```
- When attachments are present, prepend them to the system prompt as context blocks:
  ```
  The user has uploaded the following reference documents:

  --- guide.md ---
  [file content]
  --- end ---

  Use these documents as context for building assessments.
  ```
- Update `ADMIN_SYSTEM_PROMPT` to be assessment-builder focused: emphasize creating well-structured assessments from uploaded context, proper phases/sections/scoring dimensions, and guiding the user through the process
- Keep all 16 admin tools available (create_assessment, add_question, etc.)

#### 2. New client API function
**File: `src/lib/admin-api.ts`**

- Add `chatWithAttachments(messages, attachments)` function
- `attachments` is `{ filename: string; content: string }[]`

#### 3. Redesign AdminChatPage → Assessment Builder UI
**File: `src/pages/AdminChatPage.tsx`** (rewrite)

**Layout**: Single-column chat with an attachments bar above the input.

**Attachments bar** (above ChatInput):
- Drop zone / "Attach files" button supporting: `.md`, `.txt`, `.json`, `.csv`, `.yaml`, `.yml`, `.pdf`, `.docx`
- Shows attached files as removable chips/pills
- Files read client-side via `file.text()`, stored in state as `{ filename, content }[]`
- Max 500KB per file, max 5 files
- Drag-and-drop support on the entire chat area

**Chat area**:
- Same ChatMessage + ChatInput components (reused)
- Updated welcome state with assessment-builder focused quick actions:
  - "Build assessment from my uploaded file"
  - "Create a quick 10-question assessment"
  - "Help me design scoring dimensions"
  - "Import and adapt an existing framework"
- Attachments sent with every message to maintain context

**Welcome state** redesigned:
- Headline: "Assessment Builder"
- Subtext: "Upload your content, describe what you want, and I'll build a complete assessment."
- File drop zone prominently displayed
- Quick action chips below

#### 4. Remove standalone "Upload File" button from AdminAssessmentsPage
**File: `src/pages/AdminAssessmentsPage.tsx`**

- Remove the `fileInputRef`, `uploading` state, `handleFileUpload`, hidden file input, and "Upload File" button
- Remove `createAssessmentFromFile` import
- The "AI Builder" button already navigates to `/admin/chat` — rename it to "Build New" or keep as "AI Builder"

#### 5. Remove the standalone file-upload endpoint (optional cleanup)
**File: `server/index.ts`**

- Remove `POST /api/admin/assessments/from-file` — this is now handled through the chat flow
- Remove `createAssessmentFromFile` from `admin-api.ts`

---

### What stays the same
- **AI Edit tab** in AssessmentDrawer — keeps working as-is for editing existing assessments
- **Preview mode** — keeps working as-is
- **ChatMessage / ChatInput components** — reused, no changes needed
- **All 16 admin tools** — unchanged
- **Tool loop in server** — unchanged (max 10 iterations)

### File changes summary
| File | Action |
|------|--------|
| `server/index.ts` | Enhance `/api/admin/chat` to accept attachments, update system prompt |
| `src/lib/admin-api.ts` | Add `chatWithAttachments()`, remove `createAssessmentFromFile` |
| `src/pages/AdminChatPage.tsx` | Rewrite: add file attachment UI, builder-focused welcome, drag-and-drop |
| `src/pages/AdminAssessmentsPage.tsx` | Remove file upload UI (button, input, handler, state) |
