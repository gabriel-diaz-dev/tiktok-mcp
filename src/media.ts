import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function fileAsBase64(path: string, maxBytes: number, kind: string): Promise<string> {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error(`${kind} path is not a file: ${absolute}`);
  if (info.size > maxBytes) {
    throw new Error(`${kind} is too large (${info.size} bytes; max ${maxBytes})`);
  }
  return (await readFile(absolute)).toString("base64");
}

export async function prepareVideoInput(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof args.video_path !== "string") return args;
  const { video_path, ...rest } = args;
  if (rest.video_url || rest.video_base64) {
    throw new Error("Pass only one of video_path, video_url, or video_base64");
  }
  return { ...rest, video_base64: await fileAsBase64(video_path, MAX_VIDEO_BYTES, "Video") };
}

export async function prepareImageInput(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof args.image_path !== "string") return args;
  const { image_path, ...rest } = args;
  if (rest.image_url || rest.image_base64) {
    throw new Error("Pass only one of image_path, image_url, or image_base64");
  }
  return { ...rest, image_base64: await fileAsBase64(image_path, MAX_IMAGE_BYTES, "Image") };
}
