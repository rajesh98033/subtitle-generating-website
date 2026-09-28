import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type MediaInfo = {
  /** Length in seconds, or null if FFmpeg couldn't tell. */
  duration: number | null;
  /** On-screen video size (rotation applied), or null for audio-only files. */
  display: { width: number; height: number } | null;
};

/**
 * Reads a media file's duration and on-screen size with FFmpeg (no ffprobe
 * needed). Throws an ENOENT error if FFmpeg isn't installed.
 */
export async function probeMedia(fileName: string, cwd: string): Promise<MediaInfo> {
  let info = "";
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-i", fileName], { cwd });
  } catch (error) {
    // "ffmpeg -i" with no output always exits with an error; the info is in stderr.
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw err;
    info = err.stderr ?? "";
  }

  const d = info.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;

  let display: MediaInfo["display"] = null;
  const size = info.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (size) {
    let width = Number(size[1]);
    let height = Number(size[2]);
    // Phones often store portrait video as landscape plus a "rotate 90°" flag;
    // FFmpeg applies the rotation when it renders, so swap to match.
    const rotation = info.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) ?? info.match(/rotate\s*:\s*(-?\d+)/);
    if (rotation && Math.abs(Number(rotation[1])) % 180 === 90) [width, height] = [height, width];
    display = { width, height };
  }

  return { duration, display };
}
