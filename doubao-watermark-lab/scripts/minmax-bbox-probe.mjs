#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const apiKey = process.env.MINMAX_API_KEY;

function usage() {
  console.log(`Usage:
node minmax-bbox-probe.mjs --image <file> [--prompt "..."] [--model MiniMax-M3] [--endpoint https://api.minimaxi.com/v1/chat/completions]`);
}

function getArg(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function detectMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

function normalizeModelResponse(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    return raw.map((entry) => normalizeModelResponse(entry)).join("\n");
  }
  if (typeof raw === "object") {
    if (typeof raw.text === "string") return raw.text;
    if (typeof raw.refusal === "string") return raw.refusal;
    if (raw.content) return normalizeModelResponse(raw.content);
  }
  return JSON.stringify(raw);
}

function stripThink(raw) {
  return String(raw).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseRect(raw) {
  const normalized = stripThink(normalizeModelResponse(raw));
  if (!normalized) return null;

  let candidate = null;
  try {
    const direct = JSON.parse(normalized);
    candidate = direct.rect || direct;
  } catch {
    const jsonLike = normalized.match(/\{[\s\S]*\}/);
    if (jsonLike) {
      try {
        const parsed = JSON.parse(jsonLike[0]);
        candidate = parsed.rect || parsed;
      } catch {
        candidate = null;
      }
    }
  }

  if (candidate && ["x", "y", "w", "h"].every((k) => Object.prototype.hasOwnProperty.call(candidate, k))) {
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const w = Number(candidate.w);
    const h = Number(candidate.h);
    if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) return { x, y, w, h };
  }

  const match = normalized.match(
    /x\s*[:=]\s*(\d+(?:\.\d+)?)[,\s\r\n\t]+y\s*[:=]\s*(\d+(?:\.\d+)?)[,\s\r\n\t]+w\s*[:=]\s*(\d+(?:\.\d+)?)[,\s\r\n\t]+h\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  );
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const w = Number(match[3]);
  const h = Number(match[4]);
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) return { x, y, w, h };
  return null;
}

async function main() {
  const filePath = getArg("image");
  if (!filePath) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!apiKey) {
    console.error("Missing environment variable MINMAX_API_KEY");
    process.exitCode = 1;
    return;
  }

  const endpoint = getArg("endpoint", "https://api.minimaxi.com/v1/chat/completions");
  const model = getArg("model", "MiniMax-M3");
  const prompt =
    getArg(
      "prompt",
      "请只返回 JSON，例如 {\"x\":1120,\"y\":1900,\"w\":420,\"h\":210}，表示图片中豆包水印矩形的像素坐标。",
    ) || "";

  const buffer = await fs.readFile(filePath);
  const mime = detectMime(filePath);
  if (!mime.startsWith("image/")) {
    throw new Error("Only image probing is supported in this helper script.");
  }
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  const payload = {
    model,
    max_completion_tokens: 1200,
    extra_body: {
      thinking: { type: "disabled" },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const apiResult = await response.json();
  const raw = apiResult?.choices?.[0]?.message?.content || "";
  const rect = parseRect(raw);
  if (!rect) {
    console.error("Model response:");
    console.error(raw);
    throw new Error("无法解析返回的坐标 JSON。");
  }
  const normalized = {
    ...rect,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
  console.log(JSON.stringify({ file: filePath, rect: normalized }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


