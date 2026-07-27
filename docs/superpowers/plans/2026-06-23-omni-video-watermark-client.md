# Omni Video Watermark Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Windows-friendly desktop client that lets Omni users drag Gemini-generated videos in, remove the visible watermark, and export cleaned videos to a configurable output folder.

**Architecture:** Electron owns local filesystem access, folder selection, settings persistence, and the processing queue. React/Vite renders the drag-and-drop workbench. Watermark removal is isolated behind a runner that invokes the `@pilio/gemini-watermark-remover` CLI with a configurable video page URL.

**Tech Stack:** Electron, React, Vite, TypeScript, Vitest, `@pilio/gemini-watermark-remover`, Playwright Chromium.

---

### Task 1: Project Scaffold and Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/test/setup.ts`

- [ ] Add npm scripts for `dev`, `build`, `test`, and `electron:dev`.
- [ ] Install runtime dependencies: Electron, React, Vite, lucide-react, `@pilio/gemini-watermark-remover`, `playwright`, `sharp`.
- [ ] Install test/build dependencies: TypeScript, Vitest, React plugin, Testing Library, jsdom.

### Task 2: Processing Boundary

**Files:**
- Test: `src/main/removalRunner.test.ts`
- Create: `src/main/removalRunner.ts`
- Test: `src/shared/videoFiles.test.ts`
- Create: `src/shared/videoFiles.ts`

- [ ] Write failing tests for supported video extension detection.
- [ ] Write failing tests for collision-safe output path creation.
- [ ] Write failing tests for `gwr remove` argument construction, including `--output`, `--json`, `--overwrite`, `--video-page`, `--video-timeout-ms`, and `--allow-low-confidence`.
- [ ] Implement only the shared path helpers and runner API needed to pass those tests.

### Task 3: Electron Main and Preload API

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/types/omniApi.ts`

- [ ] Expose `selectOutputDirectory`, `getSettings`, `saveSettings`, `enqueueVideos`, `openPath`, and processing event subscriptions through a typed preload bridge.
- [ ] Persist settings in Electron `userData`.
- [ ] Process queue items sequentially so multiple dropped videos do not fight for CPU/browser resources.

### Task 4: React Workbench

**Files:**
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`
- Test: `src/renderer/App.test.tsx`

- [ ] Write failing UI tests for showing output folder state and rejected non-video files.
- [ ] Build the actual first-screen app: top toolbar, drag/drop target, output folder picker, task queue, status rows, and open-folder action.
- [ ] Keep controls functional through the preload API and provide a browser-safe mock fallback for tests.

### Task 5: Verification

**Files:**
- Modify: `README.md`

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the app in development mode and verify the renderer loads.
- [ ] Document setup, supported input formats, output behavior, and limitations.
