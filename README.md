# Omni Watermark Cleaner

Windows desktop client for cleaning supported visible Gemini/Veo/Omni watermarks from generated images and videos.

> Use this only on images and videos you own or have permission to modify.

## Download And Use

For normal users, download the latest `Omni-Watermark-Cleaner-Portable.zip` from GitHub Releases.

1. Unzip the whole folder.
2. Run `Run Portable Self Test.cmd` once. It verifies required files and SHA256 integrity.
3. Start the app with `Start Omni Watermark Cleaner.cmd`.
4. Choose an output folder.
5. Drag PNG, JPG, JPEG, WEBP, MP4, M4V, MOV, or WEBM files into the window.
6. Cleaned files are exported as `original-name-clean.ext`.

Image cleanup runs locally and retains the original dimensions and alpha channel. Video cleanup still uses the configured public cleanup page first.

To create a desktop shortcut on a new PC, run `Create Desktop Shortcut.cmd` from the unzipped folder. The shortcut stores its icon locally and can find the portable folder again if it is on Desktop, Downloads, Documents, a drive root, or the last saved path.

## Processing Behavior

- Gemini image cleanup runs locally with a reverse alpha-blend remover. It does not upload image files to a server, does not crop the image, and does not add blur or mosaic blocks.
- If a detectable residual remains, the app may use a nearby, border-matched texture patch only when the match is close enough. Otherwise it fails without keeping a partial output file.
- The app reads video metadata with bundled Playwright Chromium.
- All aspect ratios, including 16:9 and 9:16, try the configured public video cleanup page first.
- The default page is `https://geminiwatermarkremover.io/video`.
- Local ffmpeg cleanup is a low-confidence fallback only. It is useful when the page fails, but it can leave visible blur or mosaic artifacts.
- By default, low-confidence fallback is disabled so the app does not silently export a poor result. Enable `允许低置信度结果` only when you accept that tradeoff.

## Portable Package

The portable folder includes:

- Electron app
- bundled Playwright Chromium runtime
- bundled `ffmpeg-static`
- bundled local image watermark remover
- mascot/icon assets
- SHA256 self-test manifest
- launcher and shortcut creation scripts

Keep the folder intact. Do not copy only the `.exe`.

## Build From Source

Prerequisites:

- Windows
- Node.js 22 or newer
- PowerShell

Install dependencies:

```powershell
npm install
npx playwright install chromium
```

Run locally:

```powershell
npm run build
npm start
```

Development mode:

```powershell
npm run electron:dev
```

Build the unpacked Windows app and portable folder:

```powershell
npm run dist:win
npm run package:portable-folder
```

Verify:

```powershell
npm test
npm run smoke:image-watermark
npm run verify:portable-folder
npm run smoke:portable-app
```

Optional portable smoke tests:

```powershell
npm run smoke:portable-processing
npm run smoke:portable-unicode-paths
npm run smoke:portable-landscape-fallback
```

## Project Layout

- `electron/` Electron main/preload entrypoints
- `src/main/` processing queue, settings, metadata detection, cleanup runners
- `src/renderer/` React UI
- `scripts/` packaging, verification, and smoke-test scripts
- `assets/` app icon and mascot
- `test-videos/` small local smoke-test fixtures

## Limits

- Image cleanup targets the supported visible Gemini corner mark, not invisible SynthID or arbitrary third-party watermarks. Complex foreground behind a corner mark can be rejected when local cleanup cannot be verified without a visible artifact.
- Video cleanup targets visible generated-video watermark overlays, not invisible SynthID.
- The public cleanup page can change or become unavailable; configure another compatible page inside the app if needed.
- Local fallback is ffmpeg region cleanup, not AI repainting.
- Large videos may take several minutes; the default timeout is 15 minutes.
