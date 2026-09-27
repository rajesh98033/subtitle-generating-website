"use client";

import { useEffect, useState } from "react";
import { postForBlob } from "@/lib/upload";

type Props = {
  file: File;
  srt: string;
  baseName: string;
};

type Status = "idle" | "uploading" | "rendering" | "done" | "error";

const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const STYLES = [
  { value: "outline", label: "White with outline", sample: "text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]" },
  { value: "box", label: "White on dark box", sample: "bg-black/60 px-1.5 text-white" },
  { value: "yellow", label: "Yellow with outline", sample: "text-yellow-300 [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]" },
];

export default function BurnPanel({ file, srt, baseName }: Props) {
  const [size, setSize] = useState("medium");
  const [style, setStyle] = useState("outline");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<{ url: string; srt: string; bytes: number } | null>(null);

  const isBusy = status === "uploading" || status === "rendering";
  const isStale = video !== null && video.srt !== srt;

  useEffect(() => {
    return () => {
      if (video) URL.revokeObjectURL(video.url);
    };
  }, [video]);

  useEffect(() => {
    if (status !== "rendering") return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const handleBurn = async () => {
    setStatus("uploading");
    setProgress(0);
    setElapsed(0);
    setError("");

    const formData = new FormData();
    formData.append("video", file);
    formData.append("srt", srt);
    formData.append("size", size);
    formData.append("style", style);

    try {
      const res = await postForBlob("/api/burn", formData, {
        onProgress: setProgress,
        onUploaded: () => setStatus("rendering"),
      });
      if (!res.ok) {
        setError(res.error);
        setStatus("error");
        return;
      }
      setVideo({ url: URL.createObjectURL(res.data), srt, bytes: res.data.size });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="font-semibold">Burn subtitles into the video</h2>
      <p className="mt-1 text-sm text-white/60">
        Creates an MP4 with the subtitles drawn on the picture, so they show everywhere: Facebook, TikTok, WhatsApp,
        YouTube Shorts.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset disabled={isBusy}>
          <legend className="mb-1 text-sm text-white/70">Style</legend>
          <div className="flex flex-col gap-1.5">
            {STYLES.map((s) => (
              <label
                key={s.value}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                  style === s.value ? "border-sky-400/60 bg-sky-400/10" : "border-white/10 hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="burn-style"
                    value={s.value}
                    checked={style === s.value}
                    onChange={() => setStyle(s.value)}
                    className="accent-sky-400"
                  />
                  {s.label}
                </span>
                <span className="rounded bg-neutral-500 px-2 py-0.5">
                  <span className={`font-semibold ${s.sample}`}>नमस्ते</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col justify-between gap-4">
          <fieldset disabled={isBusy}>
            <legend className="mb-1 text-sm text-white/70">Text size</legend>
            <div className="flex rounded-lg border border-white/10 p-0.5 text-sm">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSize(s.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 ${size === s.value ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            onClick={handleBurn}
            disabled={isBusy}
            className="w-full rounded-lg bg-white px-4 py-2.5 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "uploading"
              ? `Uploading… ${progress}%`
              : status === "rendering"
                ? `Rendering video… ${elapsed}s`
                : video
                  ? "Render again"
                  : "Create video with subtitles"}
          </button>
        </div>
      </div>

      {isBusy && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-sky-400 transition-all ${status === "rendering" ? "w-full animate-pulse" : ""}`}
              style={status === "uploading" ? { width: `${progress}%` } : undefined}
            />
          </div>
          {status === "rendering" && (
            <p className="mt-2 text-center text-xs text-white/50">
              Re-encoding the video. This takes roughly as long as the video itself (less for short clips). Keep this
              tab open.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {video && (
        <div className="mt-5">
          {isStale && (
            <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              You&apos;ve edited the subtitles since this video was made. Click <strong>Render again</strong> to include
              your changes.
            </p>
          )}
          <video src={video.url} controls className="mx-auto max-h-[70vh] rounded-xl border border-white/10 bg-black" />
          <div className="mt-3 flex justify-center">
            <a
              href={video.url}
              download={`${baseName}.subtitled.mp4`}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Download video ({(video.bytes / (1024 * 1024)).toFixed(1)} MB)
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
