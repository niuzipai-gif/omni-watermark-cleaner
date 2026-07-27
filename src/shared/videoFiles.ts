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

export function createOutputPath(
  inputPath: string,
  outputDirectory: string,
  exists: (candidate: string) => boolean = () => false
): string {
  const { name, ext } = parseFileName(inputPath);
  const normalizedDirectory = normalizeDirectory(outputDirectory);
  const baseName = `${name}-clean`;
  let candidate = joinPath(normalizedDirectory, `${baseName}${ext}`);
  let counter = 2;

  while (exists(candidate)) {
    candidate = joinPath(normalizedDirectory, `${baseName}-${counter}${ext}`);
    counter += 1;
  }

  return candidate;
}

function parseFileName(filePath: string): { name: string; ext: string } {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const ext = getExtension(fileName);
  return {
    name: ext ? fileName.slice(0, -ext.length) : fileName,
    ext
  };
}

function getExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > -1 ? fileName.slice(dotIndex) : '';
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/[\\/]+/g, '\\').replace(/\\+$/, '');
}

function joinPath(directory: string, fileName: string): string {
  return `${directory}\\${fileName}`;
}
