"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatTimestamp, parseTimestamp, type Segment } from "@/lib/subtitles";
import { ROMAN_WORD, transliterate } from "@/lib/nepali";

type Props = {
  segments: Segment[];
  activeIndex: number;
  nepaliTyping: boolean;
  getCurrentTime: () => number;
  onChange: (index: number, text: string) => void;
  onTimeChange: (index: number, patch: Partial<Pick<Segment, "start" | "end">>) => void;
  onInsertAfter: (index: number) => void;
  onDelete: (index: number) => void;
  onSeek: (seconds: number) => void;
};

// Typing one of these right after a romanized word converts that word.
const WORD_END = /[\s,?!;:।.]/;
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * If the text right before `caret` ends in a romanized word, convert it to
 * Devanagari. Returns the new text and caret position.
 */
function convertWordBefore(text: string, caret: number) {
  const match = text.slice(0, caret).match(ROMAN_WORD);
  if (!match) return { text, caret };
  const start = caret - match[0].length;
  const converted = transliterate(match[0]);
  return {
    text: text.slice(0, start) + converted + text.slice(caret),
    caret: start + converted.length,
  };
}

/**
 * A time field that accepts free typing and only commits on Enter/blur.
 * Arrow keys nudge by 0.1s (Shift: 1s).
 */
function TimeInput({
  value,
  label,
  invalid,
  onCommit,
  onSetNow,
}: {
  value: number;
  label: string;
  invalid: boolean;
  onCommit: (seconds: number) => void;
  onSetNow: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatTimestamp(value, "vtt");
  const draftInvalid = draft !== null && parseTimestamp(draft) === null;

  const commit = () => {
    if (draft === null) return;
    const parsed = parseTimestamp(draft);
    if (parsed !== null && parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = (e.shiftKey ? 1 : 0.1) * (e.key === "ArrowUp" ? 1 : -1);
            onCommit(Math.max(0, Math.round((value + step) * 1000) / 1000));
            setDraft(null);
          }
        }}
        aria-label={label}
        title={`${label}: type a time, or use ↑/↓ to nudge (Shift = 1s)`}
        className={`w-[6.9rem] rounded border bg-black/40 px-1.5 py-0.5 font-mono text-xs outline-none focus:border-sky-400/60 ${
          draftInvalid || invalid ? "border-amber-400/70 text-amber-200" : "border-white/10"
        }`}
      />
      <button
        type="button"
        onClick={onSetNow}
        className="rounded px-1 text-white/40 hover:bg-white/10 hover:text-sky-300"
        title={`Set ${label.toLowerCase()} to the current video time`}
        aria-label={`Set ${label.toLowerCase()} to the current video time`}
      >
        ⏱
      </button>
    </span>
  );
}

export default function SegmentEditor({
  segments,
  activeIndex,
  nepaliTyping,
  getCurrentTime,
  onChange,
  onTimeChange,
  onInsertAfter,
  onDelete,
  onSeek,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const pendingCaret = useRef<{ el: HTMLTextAreaElement; pos: number } | null>(null);
  const [preview, setPreview] = useState<{ index: number; roman: string } | null>(null);

  // Keep the cue that's currently playing in view, without stealing focus.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    if (item && !item.contains(document.activeElement)) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  // Converting a word changes the text length, so put the caret back where
  // the user expects it once React has rendered the new value.
  useLayoutEffect(() => {
    if (pendingCaret.current) {
      const { el, pos } = pendingCaret.current;
      el.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  });

  const updatePreview = (index: number, el: HTMLTextAreaElement) => {
    if (!nepaliTyping) return setPreview(null);
    const match = el.value.slice(0, el.selectionStart).match(ROMAN_WORD);
    setPreview(match ? { index, roman: match[0] } : null);
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    let text = el.value;
    let caret = el.selectionStart;
    const inputType = (e.nativeEvent as InputEvent).inputType;

    // Only convert on real keystrokes; pasted text is left exactly as pasted.
    if (nepaliTyping && (inputType === "insertText" || inputType === "insertLineBreak") && caret > 0) {
      const typed = text[caret - 1];
      if (WORD_END.test(typed)) {
        const before = text.slice(0, caret - 1);
        const after = text.slice(caret);
        const converted = convertWordBefore(before, before.length);
        // A full stop after Nepali text becomes the danda "।".
        const end = typed === "." && DEVANAGARI.test(converted.text.slice(-1)) ? "।" : typed;
        text = converted.text + end + after;
        caret = converted.caret + end.length;
      }
    }

    if (text !== el.value) pendingCaret.current = { el, pos: caret };
    onChange(index, text);
    updatePreview(index, el);
  };

  const handleBlur = (index: number, el: HTMLTextAreaElement) => {
    setPreview(null);
    if (!nepaliTyping) return;
    // Convert a word the user finished typing but never followed with a space.
    const caret = el.selectionStart;
    if (caret !== el.selectionEnd || /\S/.test(el.value[caret] ?? "")) return;
    const converted = convertWordBefore(el.value, caret);
    if (converted.text !== el.value) onChange(index, converted.text);
  };

  return (
    <ol ref={listRef} className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
      {segments.map((seg, i) => {
        const endBeforeStart = seg.end <= seg.start;
        const overlapsPrev = i > 0 && seg.start < segments[i - 1].end - 0.001;
        const warning = endBeforeStart
          ? "End time must be after the start time."
          : overlapsPrev
            ? `Starts before #${i} ends. The two subtitles will overlap.`
            : "";

        return (
          <li
            key={i}
            className={`group rounded-lg border p-3 transition-colors ${
              i === activeIndex ? "border-sky-400/60 bg-sky-400/10" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-white/60">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSeek(seg.start)}
                  className="mr-1 rounded px-1 font-mono hover:bg-white/10 hover:text-sky-300"
                  title="Play from this subtitle"
                >
                  #{i + 1} ▶
                </button>
                <TimeInput
                  value={seg.start}
                  label="Start time"
                  invalid={endBeforeStart || overlapsPrev}
                  onCommit={(start) => onTimeChange(i, { start })}
                  onSetNow={() => onTimeChange(i, { start: getCurrentTime() })}
                />
                <span aria-hidden>→</span>
                <TimeInput
                  value={seg.end}
                  label="End time"
                  invalid={endBeforeStart}
                  onCommit={(end) => onTimeChange(i, { end })}
                  onSetNow={() => onTimeChange(i, { end: getCurrentTime() })}
                />
              </div>
              <div className="flex gap-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onInsertAfter(i)}
                  className="rounded px-2 py-0.5 hover:bg-white/10 hover:text-sky-300"
                  title="Add a new subtitle after this one"
                >
                  + Add
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(i)}
                  className="rounded px-2 py-0.5 hover:bg-red-500/20 hover:text-red-300"
                  aria-label={`Delete subtitle ${i + 1}`}
                >
                  Delete
                </button>
              </div>
            </div>
            <textarea
              value={seg.text}
              onChange={(e) => handleChange(i, e)}
              onSelect={(e) => updatePreview(i, e.currentTarget)}
              onBlur={(e) => handleBlur(i, e.currentTarget)}
              lang={nepaliTyping ? "ne" : undefined}
              spellCheck={!nepaliTyping}
              autoCapitalize={nepaliTyping ? "off" : undefined}
              autoCorrect={nepaliTyping ? "off" : undefined}
              rows={Math.min(4, Math.max(1, Math.ceil(seg.text.length / 60)))}
              placeholder="Subtitle text"
              className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-sky-400/60"
              aria-label={`Subtitle ${i + 1} text`}
            />
            {warning && <p className="mt-1 text-xs text-amber-300">{warning}</p>}
            {preview?.index === i && (
              <p className="mt-1 text-xs text-white/50" aria-live="polite">
                <span className="font-mono">{preview.roman}</span> →{" "}
                <span className="text-base text-sky-300">{transliterate(preview.roman)}</span>{" "}
                <span className="text-white/40">(press space)</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
