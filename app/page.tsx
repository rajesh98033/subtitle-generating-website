"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SegmentEditor from "./components/SegmentEditor";
import { renderSubtitles, toVTT, type Segment, type SubtitleFormat } from "@/lib/subtitles";
import { TYPING_GUIDE } from "@/lib/nepali";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

type Result = {
  baseName: string;
  language: string;
  transcript: string;
  segments: Segment[];
};

const LANGUAGES = [
  { code: "ne", label: "Nepali" },
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
  { code: "auto", label: "Auto-detect" },
];

const LINE_LENGTHS = [
  { value: 0, label: "Keep original" },
  { value: 32, label: "Short (32 chars)" },
  { value: 42, label: "Standard (42 chars)" },
  { value: 60, label: "Long (60 chars)" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadText(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Uses XHR instead of fetch so we can report upload progress. */
function uploadWithProgress(formData: FormData, onProgress: (pct: number) => void, onUploaded: () => void) {
  return new Promise<{ ok: boolean; data: Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = onUploaded;
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { error: `Server returned an unexpected response (${xhr.status}).` };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = () => reject(new Error("Network error. Is the server running?"));
    xhr.send(formData);
  });
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [language, setLanguage] = useState("ne");
  const [task, setTask] = useState<"transcribe" | "translate">("transcribe");
  const [maxChars, setMaxChars] = useState(42);

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);

  const [format, setFormat] = useState<SubtitleFormat>("srt");
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [nepaliTyping, setNepaliTyping] = useState(true);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBusy = status === "uploading" || status === "processing";
  const isAudioOnly = file?.type.startsWith("audio/") ?? false;

  useEffect(() => {
    return () => {
      if (videoURL) URL.revokeObjectURL(videoURL);
    };
  }, [videoURL]);

  // Live captions on the preview player, rebuilt whenever subtitles are edited.
  const trackURL = useMemo(() => {
    if (segments.length === 0) return "";
    return URL.createObjectURL(new Blob([toVTT(segments)], { type: "text/vtt" }));
  }, [segments]);

  useEffect(() => {
    return () => {
      if (trackURL) URL.revokeObjectURL(trackURL);
    };
  }, [trackURL]);

  // Make sure the new track is actually shown after it's swapped in.
  useEffect(() => {
    const tracks = mediaRef.current?.textTracks;
    if (tracks && tracks.length > 0) tracks[0].mode = "showing";
  }, [trackURL]);

  const activeIndex = useMemo(
    () => segments.findIndex((s) => currentTime >= s.start && currentTime < s.end),
    [segments, currentTime]
  );

  const output = useMemo(() => renderSubtitles(segments, format), [segments, format]);

  const selectFile = (next: File | null) => {
    if (isBusy) return;
    if (next && !next.type.startsWith("video/") && !next.type.startsWith("audio/")) {
      setError("Please choose a video or audio file.");
      return;
    }
    setFile(next);
    setVideoURL(next ? URL.createObjectURL(next) : "");
    setResult(null);
    setSegments([]);
    setError("");
    setStatus("idle");
    setCurrentTime(0);
  };

  const handleGenerate = async () => {
    if (!file) return;

    setStatus("uploading");
    setProgress(0);
    setError("");
    setResult(null);
    setSegments([]);

    const formData = new FormData();
    formData.append("video", file);
    formData.append("language", language);
    formData.append("task", task);
    formData.append("maxChars", String(maxChars));

    try {
      const { ok, data } = await uploadWithProgress(formData, setProgress, () => setStatus("processing"));
      if (!ok) {
        setError(String(data.error || "Processing failed."));
        setStatus("error");
        return;
      }
      const res = data as unknown as Result;
      setResult(res);
      setSegments(res.segments);
      // Devanagari subtitles are easiest to fix with romanized Nepali typing.
      setNepaliTyping(task === "transcribe" && (res.language === "ne" || res.language === "hi"));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  const updateSegment = (index: number, text: string) =>
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, text } : s)));

  const deleteSegment = (index: number) => setSegments((prev) => prev.filter((_, i) => i !== index));

  const seekTo = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    void media.play().catch(() => {});
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const outputLanguage = task === "translate" ? "en" : result?.language || language;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Subtitle Generator</h1>
          <p className="mt-2 text-sm text-white/60">
            Upload a video, get accurate subtitles in Nepali and other languages. Edit them, then download SRT or VTT.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl sm:p-6">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !isBusy && inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              selectFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragging ? "border-sky-400 bg-sky-400/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
            } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                selectFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {file ? (
              <>
                <p className="font-medium break-all">{file.name}</p>
                <p className="mt-1 text-xs text-white/50">
                  {file.type || "Unknown type"} · {formatBytes(file.size)} · click to change
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Drop a video or audio file here</p>
                <p className="mt-1 text-xs text-white/50">or click to browse · MP4, MOV, MKV, MP3, WAV…</p>
              </>
            )}
          </div>

          {/* Options */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-white/70">Spoken language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-white/70">Output</span>
              <select
                value={task}
                onChange={(e) => setTask(e.target.value as "transcribe" | "translate")}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2"
              >
                <option value="transcribe">Same language</option>
                <option value="translate">Translate to English</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-white/70">Max subtitle length</span>
              <select
                value={maxChars}
                onChange={(e) => setMaxChars(Number(e.target.value))}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2"
              >
                {LINE_LENGTHS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!file || isBusy}
            className="mt-5 w-full rounded-lg bg-white px-4 py-2.5 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "uploading"
              ? `Uploading… ${progress}%`
              : status === "processing"
                ? "Extracting audio & transcribing…"
                : status === "done"
                  ? "Regenerate subtitles"
                  : "Generate subtitles"}
          </button>

          {isBusy && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-sky-400 transition-all ${status === "processing" ? "w-full animate-pulse" : ""}`}
                style={status === "uploading" ? { width: `${progress}%` } : undefined}
              />
            </div>
          )}
          {status === "processing" && (
            <p className="mt-2 text-center text-xs text-white/50">This usually takes 10–60 seconds depending on length.</p>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </section>

        {/* Preview + results */}
        {videoURL && (
          <section className={`mt-6 grid gap-6 ${segments.length > 0 ? "lg:grid-cols-2" : ""}`}>
            <div>
              {isAudioOnly ? (
                <audio
                  ref={(el) => {
                    mediaRef.current = el;
                  }}
                  src={videoURL}
                  controls
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  className="w-full"
                />
              ) : (
                <video
                  ref={(el) => {
                    mediaRef.current = el;
                  }}
                  src={videoURL}
                  controls
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  className="w-full rounded-xl border border-white/10 bg-black"
                >
                  {trackURL && (
                    <track key={trackURL} kind="subtitles" src={trackURL} srcLang={outputLanguage} label="Generated" default />
                  )}
                </video>
              )}
              {isAudioOnly && activeIndex >= 0 && (
                <p className="mt-3 rounded-lg bg-black/60 px-3 py-2 text-center text-lg">{segments[activeIndex].text}</p>
              )}
              {segments.length > 0 && (
                <p className="mt-2 text-xs text-white/50">
                  {segments.length} subtitles · edits update the preview instantly. Click a timestamp to jump there.
                </p>
              )}
            </div>

            {segments.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Edit subtitles</h2>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={nepaliTyping}
                      onChange={(e) => setNepaliTyping(e.target.checked)}
                      className="h-4 w-4 accent-sky-400"
                    />
                    Type in Nepali (नेपाली)
                  </label>
                </div>
                {nepaliTyping && (
                  <details className="mb-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70">
                    <summary className="cursor-pointer select-none">
                      Type Nepali with English letters. The word converts when you press space.{" "}
                      <span className="text-sky-300">How to type</span>
                    </summary>
                    <table className="mt-2 w-full">
                      <tbody>
                        {TYPING_GUIDE.map(([roman, nepali]) => (
                          <tr key={roman} className="border-t border-white/5">
                            <td className="py-1 pr-3 font-mono whitespace-pre">{roman}</td>
                            <td className="py-1 text-sm text-white whitespace-pre">{nepali}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-white/50">
                      Capital T, D, N, Sh are different letters (ट ड ण ष), so type in lowercase otherwise. A Nepali
                      keyboard on your device also works.
                    </p>
                  </details>
                )}
                <SegmentEditor
                  segments={segments}
                  activeIndex={activeIndex}
                  nepaliTyping={nepaliTyping}
                  onChange={updateSegment}
                  onDelete={deleteSegment}
                  onSeek={seekTo}
                />
              </div>
            )}
          </section>
        )}

        {segments.length > 0 && result && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-lg border border-white/10 p-0.5 text-sm">
                {(["srt", "vtt", "txt"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`rounded-md px-3 py-1 uppercase ${format === f ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => downloadText(output, `${result.baseName}.${outputLanguage}.${format}`)}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90"
                >
                  Download .{format}
                </button>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/80">
              {output}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
