"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatTimestamp, type Segment } from "@/lib/subtitles";
import { ROMAN_WORD, transliterate } from "@/lib/nepali";

type Props = {
  segments: Segment[];
  activeIndex: number;
  nepaliTyping: boolean;
  onChange: (index: number, text: string) => void;
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

export default function SegmentEditor({ segments, activeIndex, nepaliTyping, onChange, onDelete, onSeek }: Props) {
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
            onChange={(e) => handleChange(i, e)}
            onSelect={(e) => updatePreview(i, e.currentTarget)}
            onBlur={(e) => handleBlur(i, e.currentTarget)}
            lang={nepaliTyping ? "ne" : undefined}
            spellCheck={!nepaliTyping}
            autoCapitalize={nepaliTyping ? "off" : undefined}
            autoCorrect={nepaliTyping ? "off" : undefined}
            rows={Math.min(4, Math.max(1, Math.ceil(seg.text.length / 60)))}
            className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-sky-400/60"
            aria-label={`Subtitle ${i + 1} text`}
          />
          {preview?.index === i && (
            <p className="mt-1 text-xs text-white/50" aria-live="polite">
              <span className="font-mono">{preview.roman}</span> →{" "}
              <span className="text-base text-sky-300">{transliterate(preview.roman)}</span>{" "}
              <span className="text-white/40">(press space)</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
