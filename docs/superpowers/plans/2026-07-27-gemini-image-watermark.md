# Gemini Image Watermark Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, local Gemini image watermark removal to Omni Watermark Cleaner while preserving the existing video workflow.

**Architecture:** A shared helper classifies input as image or video and reserves collision-safe output names. A dedicated image runner calls the installed Gemini image engine through Sharp codecs and accepts only a result whose metadata reports that removal was applied. The existing queue dispatches each task to the image or video runner, and the Electron bridge accepts mixed-media paths.

**Tech Stack:** Electron, React, TypeScript, Vitest, Sharp, @pilio/gemini-watermark-remover, Playwright, PowerShell.

---

## File Structure

- Modify: src/shared/videoFiles.ts - shared media classification and clean-name generation.
- Modify: src/shared/videoFiles.test.ts - media classification and output-path tests.
- Create: src/main/imageWatermarkRemoval.ts - local image engine adapter and fail-closed output cleanup.
- Create: src/main/imageWatermarkRemoval.test.ts - runner tests with injected engine and filesystem boundaries.
- Modify: src/main/processingQueue.ts and src/main/processingQueue.test.ts - image/video dispatch.
- Modify: electron/main.ts, electron/preload.ts, src/types/omniApi.ts - mixed-media IPC.
- Modify: src/renderer/App.tsx, src/renderer/App.test.tsx, src/renderer/styles.css - mixed-media drop flow.
- Create: scripts/smoke-image-watermark.ts - five-image final acceptance runner.
- Modify: package.json, README.md, scripts/package-portable-folder.ps1, .gitignore - commands, docs, portable readme, and generated-result exclusion.

### Task 1: Add Media Classification

**Files:**
- Modify: src/shared/videoFiles.ts
- Modify: src/shared/videoFiles.test.ts

- [ ] **Step 1: Write failing classification tests.**

    import { createOutputPath, getMediaKind, isSupportedMediaFile, isSupportedVideoFile } from './videoFiles';

    it('classifies image and video extensions case-insensitively', () => {
      expect(getMediaKind('F:/images/Gemini.PNG')).toBe('image');
      expect(getMediaKind('F:/images/photo.WebP')).toBe('image');
      expect(getMediaKind('F:/clips/scene.MOV')).toBe('video');
      expect(getMediaKind('F:/notes/readme.txt')).toBeNull();
      expect(isSupportedMediaFile('F:/images/photo.jpeg')).toBe(true);
      expect(isSupportedVideoFile('F:/images/photo.jpeg')).toBe(false);
    });

    it('preserves the image extension in the clean output name', () => {
      expect(createOutputPath('F:/input/photo.WEBP', 'D:/exports')).toBe('D:\\exports\\photo-clean.WEBP');
    });

- [ ] **Step 2: Verify red.**

    npm test -- src/shared/videoFiles.test.ts

Expected: fail because getMediaKind and isSupportedMediaFile do not exist.

- [ ] **Step 3: Implement the minimal API.**

    export type MediaKind = 'image' | 'video';

    const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm']);

    export function getMediaKind(filePath: string): MediaKind | null {
      const extension = getExtension(filePath).toLowerCase();
      if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) return 'image';
      if (SUPPORTED_VIDEO_EXTENSIONS.has(extension)) return 'video';
      return null;
    }

    export function isSupportedMediaFile(filePath: string): boolean {
      return getMediaKind(filePath) !== null;
    }

    export function isSupportedVideoFile(filePath: string): boolean {
      return getMediaKind(filePath) === 'video';
    }

Keep createOutputPath and collision behavior unchanged.

- [ ] **Step 4: Verify green.**

    npm test -- src/shared/videoFiles.test.ts

Expected: pass.

- [ ] **Step 5: Commit.**

    git add src/shared/videoFiles.ts src/shared/videoFiles.test.ts
    git commit -m "feat: classify supported image media"

### Task 2: Implement Safe Local Image Processing

**Files:**
- Create: src/main/imageWatermarkRemoval.ts
- Create: src/main/imageWatermarkRemoval.test.ts

- [ ] **Step 1: Write failing runner tests.**

    it('writes output when the engine applies Gemini cleanup', async () => {
      const writeFile = vi.fn();
      const result = await runImageWatermarkRemoval(
        { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
        {
          readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
          writeFile,
          exists: vi.fn().mockReturnValue(true),
          removeFile: vi.fn(),
          remove: vi.fn().mockResolvedValue({
            buffer: Buffer.from('clean'),
            meta: { applied: true, position: { x: 10, y: 20 } }
          })
        }
      );

      expect(result).toMatchObject({ kind: 'image', output: 'D:/out/photo-clean.png' });
      expect(writeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', Buffer.from('clean'));
    });

    it('removes a partial output when no known Gemini mark was applied', async () => {
      const removeFile = vi.fn();
      await expect(runImageWatermarkRemoval(
        { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
        {
          readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
          writeFile: vi.fn(),
          exists: vi.fn().mockReturnValue(true),
          removeFile,
          remove: vi.fn().mockResolvedValue({
            buffer: Buffer.from('unchanged'),
            meta: { applied: false, skipReason: 'watermark-not-found' }
          })
        }
      )).rejects.toThrow('Gemini watermark was not safely detected');

      expect(removeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', { force: true });
    });

- [ ] **Step 2: Verify red.**

    npm test -- src/main/imageWatermarkRemoval.test.ts

Expected: fail because the module is absent.

- [ ] **Step 3: Implement the fail-closed runner.**

    export interface ImageRemovalRequest {
      inputPath: string;
      outputPath: string;
    }

    export async function runImageWatermarkRemoval(
      request: ImageRemovalRequest,
      dependencies: ImageRemovalDependencies = defaultDependencies
    ): Promise<RemovalResult> {
      try {
        const input = await dependencies.readFile(request.inputPath);
        const processed = await dependencies.remove(input, request);

        if (!processed.meta.applied) {
          throw new Error(
            'Gemini watermark was not safely detected: ' + (processed.meta.skipReason ?? 'unknown reason')
          );
        }

        await dependencies.writeFile(request.outputPath, processed.buffer);
        if (!dependencies.exists(request.outputPath)) {
          throw new Error('Image cleanup did not create an output file.');
        }

        return {
          input: request.inputPath,
          output: request.outputPath,
          kind: 'image',
          meta: processed.meta
        };
      } catch (error) {
        await dependencies.removeFile(request.outputPath, { force: true }).catch(() => undefined);
        throw error;
      }
    }

The default remove boundary must call removeWatermarkFromBuffer from @pilio/gemini-watermark-remover/node. Decode with sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }). Encode RGBA output with JPEG quality 95, WEBP quality 95, or PNG based on the requested output extension. Pass the output MIME type and output path to the engine. Do not use FFmpeg, crop, blur, mosaic, or aggressive fallback.

- [ ] **Step 4: Verify green.**

    npm test -- src/main/imageWatermarkRemoval.test.ts src/main/removalRunner.test.ts

Expected: pass and retain all video runner behavior.

- [ ] **Step 5: Commit.**

    git add src/main/imageWatermarkRemoval.ts src/main/imageWatermarkRemoval.test.ts
    git commit -m "feat: add safe local image watermark removal"

### Task 3: Dispatch Mixed Media in the Queue

**Files:**
- Modify: src/main/processingQueue.ts
- Modify: src/main/processingQueue.test.ts

- [ ] **Step 1: Write failing queue tests.**

    it('dispatches PNG input to the image runner', async () => {
      const imageRunner = vi.fn().mockResolvedValue({
        input: 'F:/in/photo.png',
        output: 'D:/exports/photo-clean.png',
        kind: 'image'
      });
      const videoRunner = vi.fn();
      const queue = new ProcessingQueue({ imageRunner, videoRunner, exists: () => false });

      const [task] = await queue.enqueue(['F:/in/photo.png'], settings);

      expect(task).toMatchObject({ mediaKind: 'image', status: 'done' });
      expect(imageRunner).toHaveBeenCalledWith({
        inputPath: 'F:/in/photo.png',
        outputPath: 'D:\\exports\\photo-clean.png'
      });
      expect(videoRunner).not.toHaveBeenCalled();
    });

    it('rejects non-media without calling either runner', async () => {
      const imageRunner = vi.fn();
      const videoRunner = vi.fn();
      const queue = new ProcessingQueue({ imageRunner, videoRunner, exists: () => false });

      const [task] = await queue.enqueue(['F:/in/notes.txt'], settings);

      expect(task.error).toContain('Unsupported media file');
      expect(imageRunner).not.toHaveBeenCalled();
      expect(videoRunner).not.toHaveBeenCalled();
    });

- [ ] **Step 2: Verify red.**

    npm test -- src/main/processingQueue.test.ts

Expected: fail because imageRunner, videoRunner, and mediaKind are missing.

- [ ] **Step 3: Implement explicit dispatch.**

Add mediaKind: MediaKind | null to ProcessingTask. Create tasks with getMediaKind and fail with Unsupported media file when null. Preserve the current runner option as an alias for videoRunner so existing callers continue to work. Add imageRunner with runImageWatermarkRemoval as its default. Call imageRunner only with inputPath and outputPath. Call videoRunner with the current RemovalRequest and retain current video retry and timeout handling. Image errors must be terminal and must not retry. Change the folder warning to Choose an output directory before dropping files.

- [ ] **Step 4: Verify green.**

    npm test -- src/main/processingQueue.test.ts

Expected: pass, including pre-existing video retry and timeout tests.

- [ ] **Step 5: Commit.**

    git add src/main/processingQueue.ts src/main/processingQueue.test.ts
    git commit -m "feat: process image and video tasks in one queue"

### Task 4: Expose Mixed-Media Electron IPC and UI

**Files:**
- Modify: src/types/omniApi.ts
- Modify: electron/preload.ts
- Modify: electron/main.ts
- Modify: src/renderer/App.tsx
- Modify: src/renderer/App.test.tsx
- Modify: src/renderer/styles.css

- [ ] **Step 1: Write a failing renderer test.**

    it('queues a dropped PNG through the mixed-media API', async () => {
      const api = installMockApi();
      render(<App />);
      await screen.findByText('D:\\exports');

      const image = new File(['x'], 'Gemini.png', { type: 'image/png' });
      Object.defineProperty(image, 'path', { value: 'F:\\in\\Gemini.png' });
      fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [image] } });

      await waitFor(() => expect(api.enqueueFiles).toHaveBeenCalledWith(['F:\\in\\Gemini.png']));
      expect(screen.getByText(/PNG、JPG、JPEG、WEBP/)).toBeInTheDocument();
    });

- [ ] **Step 2: Verify red.**

    npm test -- src/renderer/App.test.tsx

Expected: fail because enqueueFiles and image format copy are missing.

- [ ] **Step 3: Implement the consistent bridge.**

    // src/types/omniApi.ts
    enqueueFiles(paths: string[]): Promise<ProcessingTask[]>;

    // electron/preload.ts
    enqueueFiles: (paths) => ipcRenderer.invoke('queue:enqueue-files', paths) as Promise<ProcessingTask[]>;

    // electron/main.ts
    ipcMain.handle('queue:enqueue-files', async (_event, paths: string[]) => {
      const settings = await getSettings();
      return processingQueue.enqueue(paths, settings);
    });

Update fallbackApi, mocks, and handleFiles to call isSupportedMediaFile and enqueueFiles. Change the drop heading to 把图片或视频直接拖到这里. List PNG、JPG、JPEG、WEBP、MP4、M4V、MOV、WEBM and explain that images retain their original dimensions. Render a compact 图片 or 视频 label from task.mediaKind without changing row height across status changes.

- [ ] **Step 4: Verify green.**

    npm test -- src/renderer/App.test.tsx
    npx tsc --noEmit

Expected: both commands pass and no enqueueVideos reference remains.

- [ ] **Step 5: Commit.**

    git add electron/main.ts electron/preload.ts src/types/omniApi.ts src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/styles.css
    git commit -m "feat: add image support to the desktop workbench"

### Task 5: Create the Five-Image Acceptance Runner

**Files:**
- Create: scripts/smoke-image-watermark.ts
- Modify: package.json
- Modify: .gitignore

- [ ] **Step 1: Add a dry-run test mode before writing processing code.**

The script must accept --dry-run, print JSON, and exit nonzero when a source is missing. Its source list must contain exactly these five paths:

    C:\Users\Administrator\Downloads\Gemini_Generated_Image_8peke8peke8peke8.png
    C:\Users\Administrator\Downloads\Gemini_Generated_Image_8peke8peke8peke8 (1).png
    C:\Users\Administrator\Downloads\Gemini_Generated_Image_vxvyl1vxvyl1vxvy.png
    C:\Users\Administrator\Downloads\Gemini_Generated_Image_8peke8peke8peke8 (3).png
    C:\Users\Administrator\Downloads\Gemini_Generated_Image_8peke8peke8peke8 (2).png

- [ ] **Step 2: Verify red.**

    npm run smoke:image-watermark -- --dry-run

Expected: fail because no package command or script exists.

- [ ] **Step 3: Implement the deterministic smoke runner.**

Use tsx to import runImageWatermarkRemoval. Resolve the output root and require it to equal F:\omni\test-results\image-watermark-final before deleting and recreating it. Process the five sources sequentially to clean PNG outputs. For every result, use Sharp metadata to require matching width, height, and alpha presence and require meta.applied to be true. Write report.json with source, output, dimensions, alpha, decision tier, detection source, and elapsed milliseconds. Create watermark-comparison.png from lower-right before/after crops. On any failure, remove only that sample output, append the error to report.json, and exit nonzero. Never copy, move, or delete anything in C:\Users\Administrator\Downloads.

Add this package command:

    "smoke:image-watermark": "tsx scripts/smoke-image-watermark.ts"

- [ ] **Step 4: Verify green.**

    npm run smoke:image-watermark -- --dry-run
    npm run smoke:image-watermark

Expected: the final output folder contains exactly five cleaned images, report.json, and watermark-comparison.png.

- [ ] **Step 5: Ignore generated final results and commit source only.**

Add test-results/ to .gitignore. Confirm the five Download source images still exist and remove only exact temporary probe directories created during implementation.

    git add package.json package-lock.json scripts/smoke-image-watermark.ts .gitignore
    git commit -m "test: add final Gemini image acceptance smoke"

### Task 6: Document, Package, and Verify

**Files:**
- Modify: README.md
- Modify: scripts/package-portable-folder.ps1

- [ ] **Step 1: Write a failing documentation assertion.**

Add a focused test that reads README.md and expects PNG, WEBP, 本地, 原始尺寸, and npm run smoke:image-watermark.

- [ ] **Step 2: Verify red.**

    npm test -- src/main/imageWatermarkRemoval.test.ts

Expected: fail until the README documents image support and the smoke command.

- [ ] **Step 3: Update documentation.**

Document PNG/JPG/JPEG/WEBP support, local-only processing, original-dimension output, safe failure behavior, clean filename format, and the smoke command. Update the generated portable README text so it says images and videos share one output directory and queue. Do not promise unsupported-mark removal.

- [ ] **Step 4: Verify all deliverables.**

    npm test
    npm run build
    npm run package:portable-folder
    & 'F:\omni\Omni-Watermark-Cleaner-Portable\Run Portable Self Test.cmd'

Expected: all tests, compilation, portable manifest verification, and portable self-test pass.

- [ ] **Step 5: Commit.**

    git add README.md scripts/package-portable-folder.ps1
    git commit -m "docs: document local Gemini image cleanup"

### Task 7: Final Acceptance and Public GitHub Release

**Files:**
- Modify: README.md only if a final command name changes.

- [ ] **Step 1: Run final image acceptance after the portable package build.**

    npm run smoke:image-watermark

Expected: all five images pass metadata and visual comparison checks; no intermediate outputs remain outside the final result folder.

- [ ] **Step 2: Rebuild the portable ZIP and record SHA-256.**

    Compress-Archive -Path 'F:\omni\Omni-Watermark-Cleaner-Portable\*' -DestinationPath 'F:\omni\Omni-Watermark-Cleaner-Portable.zip' -Force
    Get-FileHash -Algorithm SHA256 'F:\omni\Omni-Watermark-Cleaner-Portable.zip'

Expected: one portable ZIP and its recorded SHA-256.

- [ ] **Step 3: Verify release scope.**

    git status --short --ignored
    & 'C:\Program Files\GitHub CLI\gh.exe' auth status

Expected: committed source only; generated results, ZIP, portable folder, node_modules, and release directory ignored; active account niuzipai-gif has repo scope.

- [ ] **Step 4: Publish the intentional public repository and release.**

    & 'C:\Program Files\GitHub CLI\gh.exe' repo create omni-watermark-cleaner --public --source 'F:\omni' --remote origin --push
    & 'C:\Program Files\GitHub CLI\gh.exe' release create v0.2.0 'F:\omni\Omni-Watermark-Cleaner-Portable.zip' --repo niuzipai-gif/omni-watermark-cleaner --title 'Omni Watermark Cleaner v0.2.0' --notes 'Adds safe local Gemini image cleanup for PNG, JPG, JPEG, and WEBP. Includes the portable Windows package and full usage instructions.'

Run the create command only if origin is absent and GitHub confirms the name is free. If the repository exists, set origin to that exact repository and push main without overwriting remote history.

- [ ] **Step 5: Read back the published release.**

    & 'C:\Program Files\GitHub CLI\gh.exe' release view v0.2.0 --repo niuzipai-gif/omni-watermark-cleaner

Expected: a public release URL and the Omni-Watermark-Cleaner-Portable.zip asset.

## Plan Self-Review

- Spec coverage: Tasks 1-4 implement mixed input, safe local processing, original dimensions, and terminal failure. Task 5 validates exactly the approved five images and removes intermediates. Tasks 6-7 package, verify, and publish.
- Placeholder scan: no TBD, TODO, or deferred implementation step is present.
- Type consistency: MediaKind, ImageRemovalRequest, runImageWatermarkRemoval, enqueueFiles, imageRunner, and videoRunner are defined before use.

