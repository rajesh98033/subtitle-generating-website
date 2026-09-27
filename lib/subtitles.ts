export type Segment = {
  start: number;
  end: number;
  text: string;
};

export type SubtitleFormat = "srt" | "vtt" | "txt";

const pad = (num: number, size: number) => String(num).padStart(size, "0");

/**
 * Formats seconds as HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT).
 * Works in whole milliseconds to avoid float drift like "00:00:01,999".
 */
export function formatTimestamp(seconds: number, format: "srt" | "vtt" = "srt"): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3_600_000);
  const mins = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  const sep = format === "srt" ? "," : ".";

  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)}${sep}${pad(millis, 3)}`;
}

/**
 * Parses what a user typed into a time field back into seconds.
 * Accepts "HH:MM:SS.mmm", "MM:SS.mmm" or "SS.mmm" (comma or dot for ms).
 * Returns null if it isn't a valid time.
 */
export function parseTimestamp(value: string): number | null {
  const match = value.trim().replace(",", ".").match(/^(?:(?:(\d+):)?(\d{1,2}):)?(\d+(?:\.\d{0,3})?)$/);
  if (!match) return null;
  const [, hrs = "0", mins = "0", secs] = match;
  if (value.includes(":") && Number(secs) >= 60) return null;
  return Number(hrs) * 3600 + Number(mins) * 60 + Number(secs);
}

export function toSRT(segments: Segment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatTimestamp(seg.start, "srt")} --> ${formatTimestamp(seg.end, "srt")}\n${seg.text.trim()}\n`
    )
    .join("\n");
}

export function toVTT(segments: Segment[]): string {
  const cues = segments
    .map(
      (seg) =>
        `${formatTimestamp(seg.start, "vtt")} --> ${formatTimestamp(seg.end, "vtt")}\n${seg.text.trim()}\n`
    )
    .join("\n");

  return `WEBVTT\n\n${cues}`;
}

export function toPlainText(segments: Segment[]): string {
  return segments.map((seg) => seg.text.trim()).join("\n");
}

export function renderSubtitles(segments: Segment[], format: SubtitleFormat): string {
  if (format === "vtt") return toVTT(segments);
  if (format === "txt") return toPlainText(segments);
  return toSRT(segments);
}

/**
 * Whisper often returns segments that are too long to read on screen.
 * Split any segment longer than `maxChars` into word-aligned chunks and
 * distribute its time span proportionally to each chunk's length.
 */
export function splitLongSegments(segments: Segment[], maxChars: number): Segment[] {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return segments;

  const result: Segment[] = [];

  for (const seg of segments) {
    const text = seg.text.trim().replace(/\s+/g, " ");
    if (!text) continue;

    if (text.length <= maxChars) {
      result.push({ ...seg, text });
      continue;
    }

    const chunks: string[] = [];
    let current = "";
    for (const word of text.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);

    const duration = Math.max(0, seg.end - seg.start);
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    let cursor = seg.start;

    chunks.forEach((chunk, i) => {
      const isLast = i === chunks.length - 1;
      const end = isLast ? seg.end : cursor + (duration * chunk.length) / totalLength;
      result.push({ start: cursor, end, text: chunk });
      cursor = end;
    });
  }

  return result;
}
