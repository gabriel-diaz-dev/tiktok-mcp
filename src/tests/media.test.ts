import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareImageInput, prepareVideoInput } from "../media.js";

test("turns a local video path into base64 without leaking the path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tiktok-mcp-"));
  try {
    const path = join(dir, "clip.mp4");
    await writeFile(path, Buffer.from("video"));
    const result = await prepareVideoInput({ video_path: path, caption: "hello" });
    assert.equal(result.video_path, undefined);
    assert.equal(result.video_base64, Buffer.from("video").toString("base64"));
    assert.equal(result.caption, "hello");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects conflicting image inputs", async () => {
  await assert.rejects(
    prepareImageInput({ image_path: "avatar.png", image_url: "https://example.test/avatar.png" }),
    /Pass only one/,
  );
});
