import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("video handoff creates the file in the iframe realm", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /new frameRealm\.File\(\[bytes\], videoFile\.name, \{/,
    "the iframe must own the File instance so its Blob validation accepts the handoff",
  );
});
