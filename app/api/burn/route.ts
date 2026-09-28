import { execFile } from "child_process";
import { createReadStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { promisify } from "util";
import type { NextRequest } from "next/server";
import { BURN_SIZES, BURN_STYLES, toASS, type BurnSize, type BurnStyle } from "@/lib/ass";
import { checkDuration, checkUploadSize, getVisitor, LimitError, reserve } from "@/lib/limits";
import { probeMedia } from "@/lib/media";
import type { Segment } from "@/lib/subtitles";

export const runtime = "nodejs";
export const maxDuration = 800;

const execFileAsync = promisify(execFile);

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

function parseSegments(value: FormDataEntryValue | null): Segment[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((s) => ({ start: Number(s?.start), end: Number(s?.end), text: String(s?.text ?? "") }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.text.trim());
  } catch {
    return null;
  }
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "burn-"));
  let streaming = false;
  let release: (() => void) | undefined;

  try {
    const visitor = await getVisitor(req);
    const formData = await req.formData();
    const file = formData.get("video");
    const segments = parseSegments(formData.get("segments"));
    const sizeValue = String(formData.get("size"));
    const styleValue = String(formData.get("style"));
    const size: BurnSize = BURN_SIZES.includes(sizeValue as BurnSize) ? (sizeValue as BurnSize) : "medium";
    const style: BurnStyle = BURN_STYLES.includes(styleValue as BurnStyle) ? (styleValue as BurnStyle) : "box";

    if (!(file instanceof File) || file.size === 0) {
      return errorResponse("No video uploaded.", 400);
    }
    if (file.type && !file.type.startsWith("video/")) {
      return errorResponse("Subtitles can only be burned into a video file.", 400);
    }
    checkUploadSize(file.size);
    if (!segments || segments.length === 0) {
      return errorResponse("There are no subtitles to burn in.", 400);
    }

    const ext = path.extname(file.name).replace(/[^.\w]/g, "").slice(0, 10) || ".mp4";
    const inputName = `input${ext}`;
    await fs.writeFile(path.join(workDir, inputName), Buffer.from(await file.arrayBuffer()));
    await fs.cp(FONTS_DIR, path.join(workDir, "fonts"), { recursive: true });

    let media;
    try {
      media = await probeMedia(inputName, workDir);
    } catch {
      return errorResponse("FFmpeg is not installed or not on your PATH.", 500);
    }
    const { display, duration } = media;
    if (!display || duration === null) {
      return errorResponse("Could not read this video. Is it a valid video file?", 400);
    }
    checkDuration(duration);

    // Count this render now; it's given back in `finally` if it fails.
    release = reserve("render", visitor);

    await fs.writeFile(path.join(workDir, "subs.ass"), toASS(segments, { ...display, style, size }), "utf-8");

    // Running inside workDir lets the filter use plain relative paths, which
    // avoids FFmpeg's awkward escaping of Windows paths like "D:\My Work".
    // shaping=complex is required for Devanagari: the default "simple" layout
    // draws the ि vowel sign after its consonant ("अनतिेस" instead of "अनि तेस").
    const filter = "ass=subs.ass:fontsdir=fonts:shaping=complex";

    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i", inputName,
          "-vf", filter,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "21",
          "-pix_fmt", "yuv420p", // plays everywhere, incl. iPhone HDR sources
          "-c:a", "aac",
          "-b:a", "160k",
          "-movflags", "+faststart",
          "output.mp4",
        ],
        { cwd: workDir, maxBuffer: 64 * 1024 * 1024 }
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      if (err.code === "ENOENT") {
        return errorResponse("FFmpeg is not installed or not on your PATH.", 500);
      }
      if (/No such filter: 'ass'|Filter not found/i.test(err.stderr ?? "")) {
        return errorResponse(
          "Your FFmpeg build can't draw subtitles (it was built without libass). Install a full build, e.g. from gyan.dev on Windows.",
          500
        );
      }
      console.error("FFmpeg burn error:", err.stderr);
      return errorResponse("FFmpeg could not render the video. Check the server logs for details.", 500);
    }

    const outputPath = path.join(workDir, "output.mp4");
    const { size: outputSize } = await fs.stat(outputPath);
    const stream = createReadStream(outputPath);
    // Delete the temp folder only once the video has been sent.
    stream.on("close", () => {
      fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });
    streaming = true;

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(outputSize),
      },
    });
  } catch (error) {
    if (error instanceof LimitError) return errorResponse(error.message, error.status);
    console.error("Burn error:", error);
    return errorResponse("Something went wrong while rendering the video.", 500);
  } finally {
    if (!streaming) {
      // Don't charge people for renders that failed.
      release?.();
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
