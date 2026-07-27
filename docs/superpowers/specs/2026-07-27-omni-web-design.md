# Omni Web Design

## Goal

Publish a small, shareable website for locally cleaning the supported visible Gemini image corner mark without requiring a desktop download.

## Scope

- Image-only first release: PNG, JPG, JPEG, and WEBP.
- Browser-local processing and browser-local download; no image upload, account, or server-side storage.
- Public GPT Sites deployment first. GitHub Pages will follow only after user acceptance.
- The desktop application remains the video solution.

## Experience

- A compact, single-screen workbench rather than a marketing landing page.
- Use the supplied tortoise illustration as the product logo.
- Warm off-white canvas, muted sage panels, dark ink text, and restrained amber actions.
- Drag/drop and file-picker upload, a clear processing state, image preview, and download/reset controls.
- State the supported formats and local-processing behavior plainly near the drop zone.

## Architecture

- Create an isolated Vite/React browser project under `web/` using the Sites starter.
- Use the browser build of `@pilio/gemini-watermark-remover` with an HTML canvas codec.
- Preserve source output dimensions and export PNG so alpha remains intact.
- Reject unsupported files or uncertain cleanup rather than returning a partial result.

## Validation

- Unit test media eligibility and browser codec handling.
- Build the deployable Sites bundle.
- Test a supplied Gemini sample end-to-end in the browser implementation before publishing.
- Deploy privately to GPT Sites, return the URL for user acceptance, and do not publish the GitHub Pages copy until that acceptance.
