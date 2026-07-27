"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { repairDarkOutline } from "./contour-repair";
import { repairVisibleResidual } from "./residual-repair";

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);

type Phase = "idle" | "processing" | "ready" | "error";
type FileKind = "image" | "video" | null;

function getFileKind(file: File): FileKind {
  if (ACCEPTED_IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) return "image";
  if (ACCEPTED_VIDEO_TYPES.has(file.type) || /\.(mp4|m4v|mov|webm)$/i.test(file.name)) return "video";
  return null;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("拖入一张 Gemini 图片或视频开始处理");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [sourceUrl, resultUrl]);

  async function handleFile(file?: File) {
    if (!file) return;
    const kind = getFileKind(file);
    if (!kind) {
      setPhase("error");
      setMessage("仅支持 PNG、JPG、JPEG、WEBP、MP4、MOV、M4V 和 WEBM 文件。");
      return;
    }

    if (kind === "video") {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setSourceUrl(null);
      setResultUrl(null);
      setFileName(file.name);
      setVideoFile(file);
      setPhase("processing");
      setMessage("正在打开本地视频工作区，视频不会上传...");
      return;
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoFile(null);
    setSourceUrl(URL.createObjectURL(file));
    setResultUrl(null);
    setFileName(file.name);
    setPhase("processing");
    setMessage("正在本地清理水印，图片不会上传...");

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法读取这张图片。");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();

      const { removeWatermarkFromImageData } = await import("@pilio/gemini-watermark-remover/image-data");
      const cleaned = await removeWatermarkFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
      if (!cleaned.meta.applied) throw new Error("未能确认这是可安全处理的 Gemini 图片。");
      let output = cleaned.imageData;
      if (cleaned.meta.detection?.residualVisibility?.visible) {
        const contourFixed = await repairDarkOutline(output, cleaned.meta.position);
        output = repairVisibleResidual(output, cleaned.meta.position) ?? (contourFixed ? output : null);
      }
      if (!output) throw new Error("这张图片的背景过于复杂，网页版不会导出可能带残影的结果。请改用桌面版。");

      context.putImageData(new ImageData(output.data, output.width, output.height), 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("浏览器无法生成结果图片。");
      setResultUrl(URL.createObjectURL(blob));
      setPhase("ready");
      setMessage(`处理完成，保留原始尺寸 ${canvas.width} x ${canvas.height}。`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "处理失败，请更换图片后重试。");
    }
  }

  function chooseFile() {
    inputRef.current?.click();
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleFile(event.dataTransfer.files?.[0]);
  }

  async function handoffVideoToWorkspace() {
    if (!videoFile) return;
    const frameWindow = videoFrameRef.current?.contentWindow;
    const input = frameWindow?.document.getElementById("fileInput") as HTMLInputElement | null;
    if (!input || !frameWindow) return;
    const bytes = await videoFile.arrayBuffer();
    const frameFile = new frameWindow.File([bytes], videoFile.name, {
      type: videoFile.type,
      lastModified: videoFile.lastModified,
    });
    const transfer = new frameWindow.DataTransfer();
    transfer.items.add(frameFile);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setPhase("ready");
    setMessage("视频已交给本地视频工作区，可在下方检测并导出。");
  }

  function reset() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setSourceUrl(null);
    setResultUrl(null);
    setFileName("");
    setVideoFile(null);
    setPhase("idle");
    setMessage("拖入一张 Gemini 图片或视频开始处理");
  }

  const downloadName = `${fileName.replace(/\.[^.]+$/, "") || "gemini-image"}-clean.png`;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Omni Image Cleaner 首页">
          <img src="/omni-tortoise-logo.png" alt="Omni Image Cleaner 标志" />
          <span><b>Omni</b> Image Cleaner</span>
        </a>
        <span className="local-badge">本地处理</span>
      </header>

      <section className="workspace" id="top">
        <div className="intro">
          <p className="eyebrow">Gemini 图片与视频清理工具</p>
          <h1>拖入图片或视频，清理右下角可见水印。</h1>
          <p>无需安装，文件只在你的浏览器中处理。图片支持 PNG、JPG、JPEG、WEBP；视频支持 MP4、MOV、M4V、WEBM。</p>
        </div>

        <div className={`tool-grid ${videoFile ? "video-mode" : ""}`}>
          <section className="upload-pane" aria-label="图片上传">
            <div
              className={`drop-zone ${phase === "processing" ? "is-processing" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && chooseFile()}
              onClick={chooseFile}
            >
              <span className="upload-mark">+</span>
              <h2>{phase === "processing" ? "正在处理" : "选择或拖入图片或视频"}</h2>
              <p>图片：PNG / JPG / JPEG / WEBP<br />视频：MP4 / MOV / M4V / WEBM</p>
              <button className="primary" type="button" onClick={(event) => { event.stopPropagation(); chooseFile(); }}>选择图片或视频</button>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-m4v,video/webm" onChange={onChange} />
            </div>
            <p className={`status ${phase}`}>{message}</p>
          </section>

          {videoFile ? <section className="video-pane" aria-label="视频处理结果">
            <div className="preview-heading"><span>视频工作区</span><small>{fileName}</small></div>
            <iframe ref={videoFrameRef} src="/video/video-preview.html" title="Omni 本地视频水印清理" onLoad={() => { void handoffVideoToWorkspace(); }} />
            <div className="actions"><button className="secondary" type="button" onClick={reset}>重新开始</button></div>
          </section> : <section className="result-pane" aria-label="处理结果">
            <div className="preview-heading"><span>处理结果</span>{fileName && <small>{fileName}</small>}</div>
            <div className="preview-frame">
              {resultUrl ? <img src={resultUrl} alt="已清理水印的图片" /> : sourceUrl ? <img src={sourceUrl} alt="待处理图片预览" /> : <div className="empty-preview">结果会显示在这里</div>}
            </div>
            <div className="actions">
              {resultUrl && <a className="primary download" href={resultUrl} download={downloadName}>下载 PNG</a>}
              {(sourceUrl || resultUrl) && <button className="secondary" type="button" onClick={reset}>重新开始</button>}
            </div>
          </section>}
        </div>
      </section>

      <footer>仅用于你拥有或获授权修改的 Gemini 生成图片或视频。</footer>
    </main>
  );
}
