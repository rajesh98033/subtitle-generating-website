import fs from "fs/promises";
import path from "path";
import type { Segment } from "./subtitles";

/**
 * Transcribes (or translates to English) an audio file with Groq's Whisper
 * API. Groq's API is OpenAI-compatible, so this is one multipart POST with
 * Node's built-in fetch; no SDK needed.
 */

const API_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = "whisper-large-v3"; // "turbo" is cheaper but can't translate
const TIMEOUT_MS = 120_000;

export type Transcription = {
  text: string;
  /** Whisper's detected language, by name (e.g. "nepali"). */
  language?: string;
  segments: Segment[];
};

/** A Groq failure with a message that's safe to show users. */
export class GroqError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type RawSegment = { start?: unknown; end?: unknown; text?: unknown };

export async function transcribe(
  audioPath: string,
  { language, task }: { language: string; task: "transcribe" | "translate" }
): Promise<Transcription> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY is not set. Add it to .env.local (or your host's environment variables).", 500);
  }

  const audio = await fs.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), path.basename(audioPath));
  form.append("model", MODEL);
  form.append("response_format", "verbose_json"); // includes timestamped segments

  if (task === "transcribe") {
    form.append("timestamp_granularities[]", "segment");
    if (language !== "auto") form.append("language", language);
  }
  // Translation always outputs English, so it takes no language.

  let response: Response;
  try {
    response = await fetch(`${API_URL}/audio/${task === "translate" ? "translations" : "transcriptions"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Groq request failed:", error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new GroqError(
      timedOut ? "The subtitle service took too long to respond. Please try again." : "Could not reach the subtitle service. Please try again.",
      502
    );
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      detail = JSON.parse(body)?.error?.message ?? body;
    } catch {}
    console.error(`Groq error ${response.status}:`, detail);

    if (response.status === 401) {
      throw new GroqError("The Groq API key is invalid. Check GROQ_API_KEY.", 500);
    }
    if (response.status === 429) {
      throw new GroqError("The subtitle service is busy or has hit today's limit. Please try again later.", 503);
    }
    if (response.status === 413) {
      throw new GroqError("This audio is too large for the subtitle service.", 413);
    }
    throw new GroqError(`The subtitle service returned an error: ${detail || response.statusText}`, 502);
  }

  const data = (await response.json()) as { text?: string; language?: string; segments?: RawSegment[] };
  return {
    text: data.text ?? "",
    language: data.language,
    segments: (data.segments ?? []).map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text ?? "").trim(),
    })),
  };
}
