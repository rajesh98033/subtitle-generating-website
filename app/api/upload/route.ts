import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { NextRequest } from "next/server";
import { splitLongSegments, type Segment } from "@/lib/subtitles";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 500;
// Groq's free tier rejects audio files larger than 25 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const SCRIPT_PATH = path.join(process.cwd(), "python", "transcribe.py");

const LANGUAGE_PATTERN = /^(auto|[a-z]{2,3})$/;

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

async function transcribe(audioPath: string, language: string, task: string) {
  let stdout = "";
  try {
    const result = await execFileAsync(
      PYTHON_BIN,
      [SCRIPT_PATH, audioPath, "--language", language, "--task", task],
      {
        env: { ...process.env, GROQ_API_KEY: process.env.GROQ_API_KEY?.trim(), PYTHONIOENCODING: "utf-8" },
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    stdout = result.stdout;
    if (result.stderr) console.error("Python stderr:", result.stderr);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === "ENOENT") {
      throw new UserError(`Python ("${PYTHON_BIN}") was not found. Install Python or set PYTHON_BIN.`, 500);
    }
    // The script reports its own failures as {"error": "..."} on stdout.
    try {
      const parsed = JSON.parse(err.stdout ?? "");
      if (parsed.error) throw new UserError(parsed.error, 502);
    } catch (parseError) {
      if (parseError instanceof UserError) throw parseError;
    }
    console.error("Python error:", err.stderr);
    throw new UserError("Transcription failed. Check the server logs for details.", 500);
  }

  return JSON.parse(stdout) as { text: string; language?: string; segments: Segment[] };
}

export async function POST(req: NextRequest) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "subtitles-"));

  try {
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
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new UserError(`File is too large. The limit is ${MAX_UPLOAD_MB} MB.`, 413);
    }
    if (!LANGUAGE_PATTERN.test(language)) {
      throw new UserError("Invalid language code.");
    }

    const ext = path.extname(file.name).replace(/[^.\w]/g, "").slice(0, 10) || ".bin";
    const inputPath = path.join(workDir, `input${ext}`);
    const audioPath = path.join(workDir, "audio.mp3");

    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    await extractAudio(inputPath, audioPath);

    const { size: audioSize } = await fs.stat(audioPath);
    if (audioSize > MAX_AUDIO_BYTES) {
      throw new UserError("The audio is too long (over about 1 hour). Please trim the video and try again.", 413);
    }

    const result = await transcribe(audioPath, language, task);
    const segments = splitLongSegments(result.segments ?? [], maxChars);

    if (segments.length === 0) {
      throw new UserError("No speech was detected in this file.", 422);
    }

    const baseName = path.basename(file.name, path.extname(file.name)).replace(/[^\p{L}\p{N}_-]+/gu, "_") || "subtitles";

    return Response.json({
      baseName,
      language: result.language ?? language,
      transcript: result.text ?? "",
      segments,
    });
  } catch (error) {
    if (error instanceof UserError) {
      return errorResponse(error.message, error.status);
    }
    console.error("Processing error:", error);
    return errorResponse("Something went wrong while processing the file.", 500);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
