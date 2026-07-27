import { CheckCircle2, Clock3, Folder, FolderOpen, Loader2, Settings2, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AppSettings, ProcessingTask } from '../types/omniApi';
import { isSupportedMediaFile } from '../shared/videoFiles';

const DEFAULT_SETTINGS: AppSettings = {
  outputDirectory: null,
  videoPage: 'https://geminiwatermarkremover.io/video',
  timeoutMs: 15 * 60 * 1000,
  allowLowConfidence: false
};

const fallbackApi = {
  async getSettings() {
    return DEFAULT_SETTINGS;
  },
  async saveSettings(settings: AppSettings) {
    return settings;
  },
  async selectOutputDirectory() {
    return null;
  },
  getPathForFile(file: File) {
    return getDroppedFilePathFallback(file);
  },
  async enqueueFiles() {
    return [];
  },
  async openPath() {
    return undefined;
  },
  onTaskUpdated() {
    return () => undefined;
  }
};

export default function App() {
  const api = window.omni ?? fallbackApi;
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [videoPageDraft, setVideoPageDraft] = useState(DEFAULT_SETTINGS.videoPage);

  useEffect(() => {
    void api.getSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      setVideoPageDraft(loadedSettings.videoPage);
    });
    return api.onTaskUpdated((updatedTask) => {
      setTasks((current) => upsertTask(current, updatedTask));
    });
  }, []);

  const counts = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        acc[task.status] += 1;
        return acc;
      },
      { queued: 0, processing: 0, done: 0, failed: 0 } as Record<ProcessingTask['status'], number>
    );
  }, [tasks]);

  async function chooseOutputDirectory() {
    const selected = await api.selectOutputDirectory();
    if (!selected) return;
    const saved = await api.saveSettings({ ...settings, outputDirectory: selected });
    setSettings(saved);
  }

  async function saveVideoPage() {
    const saved = await api.saveSettings({ ...settings, videoPage: videoPageDraft.trim() || DEFAULT_SETTINGS.videoPage });
    setSettings(saved);
    setVideoPageDraft(saved.videoPage);
  }

  async function toggleLowConfidence() {
    const saved = await api.saveSettings({ ...settings, allowLowConfidence: !settings.allowLowConfidence });
    setSettings(saved);
  }

  async function handleFiles(files: FileList | File[]) {
    setNotice(null);
    const paths = Array.from(files)
      .map((file) => getDroppedFilePath(file, api))
      .filter(Boolean);

    const rejected = paths.filter((filePath) => !isSupportedMediaFile(filePath));
    const accepted = paths.filter(isSupportedMediaFile);

    if (rejected.length > 0) {
      setNotice(`不支持的文件：${rejected.map((filePath) => basename(filePath)).join('、')}`);
    }

    if (accepted.length === 0) return;
    const queued = await api.enqueueFiles(accepted);
    setTasks((current) => queued.reduce(upsertTask, current));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Omni Watermark Cleaner</h1>
          <p>拖入 Gemini 图片或 Veo 视频，本地清理支持的可见水印并导出到指定文件夹。</p>
        </div>
        <button className="icon-button primary" type="button" onClick={chooseOutputDirectory} aria-label="更换导出文件夹">
          <FolderOpen size={18} />
          更换导出文件夹
        </button>
      </header>

      <section className="workspace">
        <aside className="side-panel">
          <div className="panel-section">
            <div className="section-title">
              <Folder size={17} />
              导出位置
            </div>
            <div className="path-box">{settings.outputDirectory ?? '尚未选择导出文件夹'}</div>
            {settings.outputDirectory ? (
              <button className="text-button" type="button" onClick={() => api.openPath(settings.outputDirectory!)}>
                打开文件夹
              </button>
            ) : null}
          </div>

          <div className="panel-section">
            <div className="section-title">
              <Settings2 size={17} />
              处理设置
            </div>
            <label className="field-label" htmlFor="video-page">
              视频处理页
            </label>
            <input id="video-page" value={videoPageDraft} onChange={(event) => setVideoPageDraft(event.target.value)} />
            <button className="text-button" type="button" onClick={saveVideoPage}>
              保存处理页
            </button>
            <label className="check-row">
              <input type="checkbox" checked={settings.allowLowConfidence} onChange={toggleLowConfidence} />
              允许低置信度结果
            </label>
          </div>

          <div className="panel-section stats">
            <div>
              <strong>{counts.processing}</strong>
              <span>处理中</span>
            </div>
            <div>
              <strong>{counts.done}</strong>
              <span>完成</span>
            </div>
            <div>
              <strong>{counts.failed}</strong>
              <span>失败</span>
            </div>
          </div>
        </aside>

        <section className="main-panel">
          <div
            data-testid="drop-zone"
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
          >
            <Upload size={32} />
            <h2>把图片或视频直接拖到这里</h2>
            <p>支持 PNG、JPG、JPEG、WEBP、MP4、M4V、MOV、WEBM。图片保留原始尺寸，导出文件自动命名为 <span>原名-clean</span>。</p>
          </div>

          {notice ? (
            <div className="notice">
              <TriangleAlert size={17} />
              {notice}
            </div>
          ) : null}

          <div className="queue-header">
            <h2>任务队列</h2>
            <span>{tasks.length === 0 ? '等待视频' : `${tasks.length} 个任务`}</span>
          </div>

          <div className="task-list">
            {tasks.length === 0 ? <div className="empty-state">拖入图片或视频后会在这里显示处理进度。</div> : null}
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function TaskRow({ task }: { task: ProcessingTask }) {
  const Icon = task.status === 'done' ? CheckCircle2 : task.status === 'failed' ? TriangleAlert : task.status === 'processing' ? Loader2 : Clock3;
  return (
    <article className={`task-row ${task.status}`}>
      <Icon className={task.status === 'processing' ? 'spin' : ''} size={19} />
      <div>
        <strong>
          {basename(task.inputPath)} <span className="media-kind">{task.mediaKind === 'image' ? '图片' : '视频'}</span>
        </strong>
        <span>{getTaskDetail(task)}</span>
      </div>
      <StatusPill status={task.status} />
    </article>
  );
}

function getTaskDetail(task: ProcessingTask): string | null {
  if (task.status === 'failed') return task.error ?? task.outputPath;
  if (task.status === 'processing' && task.error) return task.error;
  return task.outputPath ?? task.error;
}

function StatusPill({ status }: { status: ProcessingTask['status'] }) {
  const labels: Record<ProcessingTask['status'], string> = {
    queued: '排队',
    processing: '处理中',
    done: '完成',
    failed: '失败'
  };
  return <span className={`status-pill ${status}`}>{labels[status]}</span>;
}

function upsertTask(tasks: ProcessingTask[], task: ProcessingTask): ProcessingTask[] {
  const index = tasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) return [task, ...tasks];
  const next = [...tasks];
  next[index] = task;
  return next;
}

function getDroppedFilePath(file: File, api: Pick<typeof fallbackApi, 'getPathForFile'>): string {
  return api.getPathForFile(file) || getDroppedFilePathFallback(file);
}

function getDroppedFilePathFallback(file: File): string {
  return (file as File & { path?: string }).path ?? file.name;
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}
