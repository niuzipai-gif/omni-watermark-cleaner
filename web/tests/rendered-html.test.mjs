import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Omni image and video workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Omni Image Cleaner<\/title>/i);
  assert.match(html, /Gemini 图片与视频清理工具/);
  assert.match(html, /选择或拖入图片或视频/);
  assert.match(html, /MP4、MOV、M4V、WEBM/);
  assert.match(html, /本地处理/);
  assert.match(html, /omni-tortoise-logo\.png/);
});
