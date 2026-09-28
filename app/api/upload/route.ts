import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { NextRequest } from "next/server";
import { checkDuration, checkUploadSize, getVisitor, LimitError, reserve } from "@/lib/limits";
import { GroqError, transcribe } from "@/lib/groq";
import { probeMedia } from "@/lib/media";
import { splitLongSegments } from "@/lib/subtitles";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

// Groq's free tier rejects audio files larger than 25 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const LANGUAGE_PATTERN = /^(auto|[a-z]{2,3})$/;
// Whisper reports the detected language by name, e.g. "nepali".
const LANGUAGE_CODES: Record<string, string> = { nepali: "ne", hindi: "hi", english: "en" };

function languageCode(requested: string, detected?: string) {
  if (requested !== "auto") return requested;
  const name = (detected ?? "").toLowerCase();
  return LANGUAGE_CODES[name] ?? (/^[a-z]{2,3}$/.test(name) ? name : "und");
}

class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function extractAudio(inputPath: string, outputPath: string) {
  try {
    // Mono 16 kHz is what Whisper uses internally; 48 kbps MP3 keeps roughly
    // an hour of speech under the 25 MB API limit.
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", outputPath],
      { maxBuffer: 16 * 1024 * 1024 }
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new UserError("FFmpeg is not installed or not on your PATH.", 500);
    }
    if (err.stderr?.includes("does not contain any stream") || err.stderr?.includes("Output file #0 does not contain")) {
      throw new UserError("This file has no audio track.");
    }
    console.error("FFmpeg error:", err.stderr);
    throw new UserError("Could not read audio from this file. Is it a valid video or audio file?");
  }
}

export async function POST(req: NextRequest) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "subtitles-"));
  let release: (() => void) | undefined;

  try {
    const visitor = await getVisitor(req);
    const formData = await req.formData();
    const file = formData.get("video");
    const language = String(formData.get("language") || "ne").toLowerCase();
    const task = formData.get("task") === "translate" ? "translate" : "transcribe";
    const maxChars = Number(formData.get("maxChars")) || 0;

    if (!(file instanceof File) || file.size === 0) {
      throw new UserError("No file uploaded.");
    }
    if (file.type && !file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      throw new UserError("Please upload a video or audio file.");
    }
    checkUploadSize(file.size);
    if (!LANGUAGE_PATTERN.test(language)) {
      throw new UserError("Invalid language code.");
    }

    const ext = path.extname(file.name).replace(/[^.\w]/g, "").slice(0, 10) || ".bin";
    const inputPath = path.join(workDir, `input${ext}`);
    const audioPath = path.join(workDir, "audio.mp3");

    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    let duration: number | null;
    try {
      ({ duration } = await probeMedia(inputPath, workDir));
    } catch {
      throw new UserError("FFmpeg is not installed or not on your PATH.", 500);
    }
    if (duration === null) {
      throw new UserError("Could not read this file. Is it a valid video or audio file?");
    }
    checkDuration(duration);

    // Count this video now; it's given back below if processing fails.
    release = reserve("video", visitor, duration);

    await extractAudio(inputPath, audioPath);

    const { size: audioSize } = await fs.stat(audioPath);
    if (audioSize > MAX_AUDIO_BYTES) {
      throw new UserError("The audio is too long (over about 1 hour). Please trim the video and try again.", 413);
    }

    const result = await transcribe(audioPath, { language, task });
    const segments = splitLongSegments(result.segments ?? [], maxChars);

    if (segments.length === 0) {
      throw new UserError("No speech was detected in this file.", 422);
    }

    const baseName = path.basename(file.name, path.extname(file.name)).replace(/[^\p{L}\p{N}_-]+/gu, "_") || "subtitles";

    return Response.json({
      baseName,
      language: languageCode(language, result.language),
      transcript: result.text ?? "",
      segments,
    });
  } catch (error) {
    // Don't charge people for videos that failed.
    release?.();
    if (error instanceof UserError || error instanceof LimitError || error instanceof GroqError) {
      return errorResponse(error.message, error.status);
    }
    console.error("Processing error:", error);
    return errorResponse("Something went wrong while processing the file.", 500);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
