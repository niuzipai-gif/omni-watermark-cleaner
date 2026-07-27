# Gemini Image Watermark Removal Design

## Goal

Extend Omni Watermark Cleaner so a user can drag Gemini-generated images and videos into one desktop queue, remove supported Gemini watermarks locally, and export cleaned files to the selected folder. Image processing must preserve the original dimensions and must not create the blur or mosaic artifacts associated with video-region fallback cleanup.

## Scope

- Accept image files with the extensions PNG, JPG, JPEG, and WEBP alongside the existing video formats.
- Use the bundled `@pilio/gemini-watermark-remover` image engine locally. No image is uploaded to a server.
- Detect watermark placement with the engine's Gemini size catalog and adaptive local anchor search.
- Export a cleaned image only when the engine reports a successful, safe application.
- Retain the original extension when supported and name the output `original-name-clean.ext`.
- Preserve image dimensions and preserve alpha data for PNG and WEBP inputs when the source contains alpha.
- Keep video behavior unchanged.

## Non-Goals

- Do not use blur, crop, mosaic, or FFmpeg `delogo` for images.
- Do not add a fake manual-coordinate control. The selected local engine determines the watermark position from the known Gemini mark and does not expose a stable arbitrary-coordinate API.
- Do not overwrite source files.
- Do not include user-provided image samples in the public repository or release package.

## User Experience

The existing drag area becomes a mixed-media drop zone. Dropping supported images or videos adds tasks to one queue. Each task carries an explicit media kind (`image` or `video`) so it can display the correct detail and use the appropriate processing path.

Image tasks display one of four states:

1. Queued: input accepted and output path reserved.
2. Processing: local Gemini image engine is analyzing and restoring the known mark.
3. Done: output was written and the engine reported that watermark removal was applied.
4. Failed: no output is accepted when the engine cannot safely identify or apply the supported Gemini watermark. The row shows the reason and the source stays unchanged.

The image mode defaults to safe automatic cleanup. An aggressive mode is intentionally excluded from the first release because a false positive is worse than a visible watermark.

## Architecture

Add an image-file helper for extension validation and collision-safe output naming. Add an image runner that calls the bundled engine through its Node file API with Sharp-backed decoding and encoding. It returns a structured image result containing the source path, output path, media kind, and engine metadata.

The existing processing queue receives mixed input paths, determines the media kind from the extension, and calls either the image runner or the existing video runner. Settings and output-directory handling remain shared.

The renderer uses the same drop target and task list. Its instructional copy lists both image and video formats. No image data is placed in renderer state or persisted in settings.

## Failure Handling

- Unsupported extensions are rejected before queueing and named in the UI notice.
- A missing output folder prevents queueing, as with video.
- Engine exceptions, a non-applied result, or a missing output file mark the task as failed.
- Any partial image output is removed on failure so the selected output folder does not contain misleading files.
- Output-name collisions receive a numeric suffix rather than overwriting existing cleaned files.

## Verification

Automated tests cover supported image identification, output naming, runner success metadata, non-applied engine responses, failure cleanup, and image/video queue dispatch.

The final acceptance run uses only the five user-supplied images in `C:\Users\Administrator\Downloads`:

| Sample | Dimensions | Coverage |
| --- | ---: | --- |
| `Gemini_Generated_Image_8peke8peke8peke8.png` | 2752 x 1536 | widescreen landscape |
| `Gemini_Generated_Image_8peke8peke8peke8 (1).png` | 2400 x 1792 | standard landscape |
| `Gemini_Generated_Image_vxvyl1vxvyl1vxvy.png` | 2048 x 2048 | square |
| `Gemini_Generated_Image_8peke8peke8peke8 (3).png` | 1792 x 2400 | portrait |
| `Gemini_Generated_Image_8peke8peke8peke8 (2).png` | 1536 x 2752 | tall portrait |

For each result, verify output existence, matching dimensions, matching alpha presence, successful engine metadata, and a visible before/after crop of the lower-right mark. Keep only the final cleaned images and report in `F:\omni\test-results\image-watermark-final`; remove intermediate probe outputs and temporary copies. Never delete the user source images.

## Release

After all unit tests, build, portable-package verification, and final image acceptance pass, update the README with image support and publish the committed source plus portable ZIP as a public GitHub release through the persistent local `gh` login.
