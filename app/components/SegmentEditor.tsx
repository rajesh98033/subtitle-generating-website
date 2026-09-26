"use client";

import { useEffect, useRef } from "react";
import { formatTimestamp, type Segment } from "@/lib/subtitles";

type Props = {
  segments: Segment[];
  activeIndex: number;
  onChange: (index: number, text: string) => void;
  onDelete: (index: number) => void;
  onSeek: (seconds: number) => void;
};

export default function SegmentEditor({ segments, activeIndex, onChange, onDelete, onSeek }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the cue that's currently playing in view, without stealing focus.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    if (item && !item.contains(document.activeElement)) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <ol ref={listRef} className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
      {segments.map((seg, i) => (
        <li
          key={i}
          className={`group rounded-lg border p-3 transition-colors ${
            i === activeIndex ? "border-sky-400/60 bg-sky-400/10" : "border-white/10 bg-white/5"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/60">
            <button
              type="button"
              onClick={() => onSeek(seg.start)}
              className="font-mono hover:text-sky-300"
              title="Jump to this subtitle"
            >
              #{i + 1} · {formatTimestamp(seg.start, "vtt")} → {formatTimestamp(seg.end, "vtt")}
            </button>
            <button
              type="button"
              onClick={() => onDelete(i)}
              className="rounded px-2 py-0.5 text-white/40 opacity-0 hover:bg-red-500/20 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
              aria-label={`Delete subtitle ${i + 1}`}
            >
              Delete
            </button>
          </div>
          <textarea
            value={seg.text}
            onChange={(e) => onChange(i, e.target.value)}
            rows={Math.min(4, Math.max(1, Math.ceil(seg.text.length / 60)))}
            className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-sky-400/60"
            aria-label={`Subtitle ${i + 1} text`}
          />
        </li>
      ))}
    </ol>
  );
}
