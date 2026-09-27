import { execFile } from "child_process";
import { createReadStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { promisify } from "util";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 800;

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 500;
const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");
// Bundled so Nepali renders the same on every machine, whatever fonts are installed.
const FONT_NAME = "Noto Sans Devanagari";

// Sizes are in libass units: relative to a 288px-tall canvas, so they scale
// with the video's resolution.
const SIZES: Record<string, number> = { small: 14, medium: 18, large: 24 };

const STYLES: Record<string, string> = {
  // White text with a black outline: readable on anything, least intrusive.
  outline: "BorderStyle=1,Outline=1.6,Shadow=0.6,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000",
  // White text on a semi-transparent black box, the social media look.
  box: "BorderStyle=3,Outline=6,Shadow=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000",
  // Yellow text with an outline, the classic film-subtitle look.
  yellow: "BorderStyle=1,Outline=1.6,Shadow=0.6,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000",
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "burn-"));
  let streaming = false;

  try {
    const formData = await req.formData();
    const file = formData.get("video");
    const srt = formData.get("srt");
    const size = SIZES[String(formData.get("size"))] ?? SIZES.medium;
    const style = STYLES[String(formData.get("style"))] ?? STYLES.outline;

    if (!(file instanceof File) || file.size === 0) {
      return errorResponse("No video uploaded.", 400);
    }
    if (file.type && !file.type.startsWith("video/")) {
      return errorResponse("Subtitles can only be burned into a video file.", 400);
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return errorResponse(`File is too large. The limit is ${MAX_UPLOAD_MB} MB.`, 413);
    }
    if (typeof srt !== "string" || !srt.trim()) {
      return errorResponse("There are no subtitles to burn in.", 400);
    }

    const ext = path.extname(file.name).replace(/[^.\w]/g, "").slice(0, 10) || ".mp4";
    await fs.writeFile(path.join(workDir, `input${ext}`), Buffer.from(await file.arrayBuffer()));
    await fs.writeFile(path.join(workDir, "subs.srt"), srt, "utf-8");
    await fs.cp(FONTS_DIR, path.join(workDir, "fonts"), { recursive: true });

    // Running inside workDir lets the filter use plain relative paths, which
    // avoids FFmpeg's awkward escaping of Windows paths like "D:\My Work".
    const filter = `subtitles=subs.srt:charenc=UTF-8:fontsdir=fonts:force_style='FontName=${FONT_NAME},FontSize=${size},MarginV=18,${style}'`;

    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i", `input${ext}`,
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
      if (/No such filter: 'subtitles'|Filter not found/i.test(err.stderr ?? "")) {
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
    console.error("Burn error:", error);
    return errorResponse("Something went wrong while rendering the video.", 500);
  } finally {
    if (!streaming) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
