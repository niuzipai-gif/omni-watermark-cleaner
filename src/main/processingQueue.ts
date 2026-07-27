import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';

import type { AppSettings } from './settingsStore';
import type { ImageRemovalRequest } from './imageWatermarkRemoval';
import { runImageWatermarkRemoval } from './imageWatermarkRemoval';
import type { RemovalRequest, RemovalResult } from './removalRunner';
import { runWatermarkRemoval } from './removalRunner';
import { createOutputPath, getMediaKind, type MediaKind } from '../shared/videoFiles';

export type TaskStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface ProcessingTask {
  id: string;
  inputPath: string;
  mediaKind: MediaKind | null;
  outputPath: string | null;
  status: TaskStatus;
  error: string | null;
  result: RemovalResult | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessingQueueOptions {
  runner?: (request: RemovalRequest) => Promise<RemovalResult>;
  videoRunner?: (request: RemovalRequest) => Promise<RemovalResult>;
  imageRunner?: (request: ImageRemovalRequest) => Promise<RemovalResult>;
  exists?: (candidate: string) => boolean;
  timeoutGraceMs?: number;
}

type ProcessingQueueEvents = 'task-updated';
const MAX_PROCESSING_ATTEMPTS = 3;

export class ProcessingQueue extends EventEmitter {
  private readonly videoRunner: (request: RemovalRequest) => Promise<RemovalResult>;
  private readonly imageRunner: (request: ImageRemovalRequest) => Promise<RemovalResult>;
  private readonly exists: (candidate: string) => boolean;
  private readonly timeoutGraceMs: number;
  private chain = Promise.resolve();

  constructor(options: ProcessingQueueOptions = {}) {
    super();
    this.videoRunner = options.videoRunner ?? options.runner ?? runWatermarkRemoval;
    this.imageRunner = options.imageRunner ?? runImageWatermarkRemoval;
    this.exists = options.exists ?? (() => false);
    this.timeoutGraceMs = options.timeoutGraceMs ?? 30_000;
  }

  override on(eventName: ProcessingQueueEvents, listener: (task: ProcessingTask) => void): this {
    return super.on(eventName, listener);
  }

  async enqueue(inputPaths: string[], settings: AppSettings): Promise<ProcessingTask[]> {
    if (settings.outputDirectory) {
      await mkdir(settings.outputDirectory, { recursive: true });
    }
    const tasks = inputPaths.map((inputPath) => this.createTask(inputPath, settings.outputDirectory));

    for (const task of tasks) {
      this.emitUpdate(task);
      if (task.status === 'queued') {
        this.chain = this.chain.then(() => this.processTask(task, settings));
      }
    }

    await this.chain;
    return tasks;
  }

  private createTask(inputPath: string, outputDirectory: string | null): ProcessingTask {
    const now = Date.now();
    const task: ProcessingTask = {
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      inputPath,
      mediaKind: getMediaKind(inputPath),
      outputPath: null,
      status: 'queued',
      error: null,
      result: null,
      createdAt: now,
      updatedAt: now
    };

    if (!task.mediaKind) {
      task.status = 'failed';
      task.error = `Unsupported media file: ${inputPath}`;
      return task;
    }

    if (!outputDirectory) {
      task.status = 'failed';
      task.error = 'Choose an output directory before dropping files.';
      return task;
    }

    task.outputPath = createOutputPath(inputPath, outputDirectory, this.exists);
    return task;
  }

  private async processTask(task: ProcessingTask, settings: AppSettings): Promise<void> {
    if (!task.outputPath) return;

    this.updateTask(task, { status: 'processing' });
    if (task.mediaKind === 'image') {
      try {
        const result = await withTimeout(
          this.imageRunner({ inputPath: task.inputPath, outputPath: task.outputPath }),
          settings.timeoutMs + this.timeoutGraceMs,
          `Processing timed out after ${Math.round((settings.timeoutMs + this.timeoutGraceMs) / 1000)} seconds.`
        );
        this.updateTask(task, { status: 'done', result, error: null });
      } catch (error) {
        this.updateTask(task, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }

    for (let attempt = 1; attempt <= MAX_PROCESSING_ATTEMPTS; attempt += 1) {
      try {
        const result = await withTimeout(
          this.videoRunner({
            inputPath: task.inputPath,
            outputPath: task.outputPath,
            videoPage: settings.videoPage,
            timeoutMs: settings.timeoutMs,
            allowLowConfidence: settings.allowLowConfidence
          }),
          settings.timeoutMs + this.timeoutGraceMs,
          `Processing timed out after ${Math.round((settings.timeoutMs + this.timeoutGraceMs) / 1000)} seconds.`
        );
        this.updateTask(task, { status: 'done', result, error: null });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_PROCESSING_ATTEMPTS || !shouldRetryProcessingError(message)) {
          this.updateTask(task, {
            status: 'failed',
            error: message
          });
          return;
        }
        this.updateTask(task, {
          status: 'processing',
          error: `第 ${attempt} 次失败，正在重试：${message}`
        });
      }
    }
  }

  private updateTask(task: ProcessingTask, patch: Partial<ProcessingTask>): void {
    Object.assign(task, patch, { updatedAt: Date.now() });
    this.emitUpdate(task);
  }

  private emitUpdate(task: ProcessingTask): void {
    this.emit('task-updated', { ...task });
  }
}

function shouldRetryProcessingError(message: string): boolean {
  return !message.startsWith('High-quality public page cleanup failed.') && !message.startsWith('Processing timed out after');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
