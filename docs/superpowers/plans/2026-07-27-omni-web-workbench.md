# Omni Web Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished public web workbench that cleans supported Gemini image watermarks locally in the browser.

**Architecture:** A separate Sites-compatible Vite/React project in `web/` owns the browser interface and build output. It calls the browser SDK with Canvas codecs, keeps image data in memory, and exports a PNG only after the remover reports a safe applied result.

**Tech Stack:** Vite, React, TypeScript, `@pilio/gemini-watermark-remover/browser`, Sites hosting.

---

### Task 1: Create the isolated Sites project

**Files:**
- Create: `web/` via the Sites initializer
- Create: `web/.openai/hosting.json`
- Create: `web/public/omni-tortoise-logo.png`

- [ ] Initialize `F:\omni\web` with the Sites initializer, install `@pilio/gemini-watermark-remover`, copy the approved logo to `web/public/omni-tortoise-logo.png`, run `npm run build`, then commit the scaffold as `feat: scaffold Omni web workbench`.

### Task 2: Implement local browser watermark cleanup

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/lib/imageCleanup.ts`
- Create: `web/src/lib/imageCleanup.test.ts`

- [ ] Write failing eligibility tests for PNG/JPG/JPEG/WEBP acceptance and MP4 rejection. Implement Canvas RGBA codecs, call the browser remover, reject missing or visible-residual cleanup, and return a same-dimension PNG Blob. Run the targeted test, then commit as `feat: clean Gemini images in browser`.

### Task 3: Build the single-screen workbench

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/app.css` or the initializer stylesheet
- Modify: `web/index.html` or site layout metadata

- [ ] Add the approved responsive workbench: tortoise logo, warm off-white canvas, muted sage upload panel, amber primary controls, click upload, drag/drop, preview, processing/error state, download, reset, focus support, and local-processing notice. Add UI tests, run `npm test && npm run build`, then commit as `feat: add Omni browser image workbench`.

### Task 4: Verify, package, and publish GPT Sites

**Files:**
- Modify: `web/.openai/hosting.json`
- Create: temporary Sites archive outside the source tree

- [ ] Run an end-to-end cleanup of `C:\Users\Administrator\Downloads\Gemini_Generated_Image_vxvyl1vxvyl1vxvy.png`, asserting successful PNG output at 2048x2048. Commit and push the exact source state. Create `omni-image-cleaner` once, persist its project ID, package the deployment, save a private Sites version, deploy it, poll to success, and return only the GPT Sites URL for user acceptance before creating GitHub Pages.
