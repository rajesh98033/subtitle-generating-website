import type { Segment } from "./subtitles";

/**
 * Builds an ASS subtitle script for burning subtitles into a video with
 * FFmpeg/libass. Unlike SRT + force_style, ASS lets us lay out text in the
 * video's real pixel size, so subtitles look the same on portrait phone
 * videos and landscape videos.
 */

export type BurnStyle = "box" | "outline" | "yellow";
export type BurnSize = "small" | "medium" | "large";

export const BURN_STYLES: BurnStyle[] = ["box", "outline", "yellow"];
export const BURN_SIZES: BurnSize[] = ["small", "medium", "large"];

// Font size as a share of the video's shorter side. "medium" roughly matches
// the browser's caption size in the preview player (about 5% of the height of
// a landscape video).
const SIZE_RATIO: Record<BurnSize, number> = { small: 0.045, medium: 0.055, large: 0.07 };

// ASS colours are &HAABBGGRR, where AA=00 is opaque and FF is transparent.
const WHITE = "&H00FFFFFF";
const YELLOW = "&H0000FFFF";
const INVISIBLE = "&HFF000000";
const BOX = "&H40000000"; // black at ~75% opacity, like the preview's ::cue background

function timestamp(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

// Braces start override tags and backslashes start escapes in ASS, so
// neutralise them; real line breaks become ASS's "\N".
function escapeText(text: string) {
  return text
    .trim()
    .replace(/\\/g, "＼")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, "\\N");
}

export function toASS(
  segments: Segment[],
  { width, height, style, size }: { width: number; height: number; style: BurnStyle; size: BurnSize }
) {
  const fontSize = Math.round(Math.min(width, height) * SIZE_RATIO[size]);
  const isPortrait = height > width;
  // Keep clear of the bottom edge; portrait videos go to apps (TikTok,
  // Reels, Shorts) whose buttons cover the bottom of the screen.
  const marginV = Math.round(height * (isPortrait ? 0.12 : 0.07));
  const marginH = Math.round(width * 0.06);

  // No outline or shadow on the letters in any style: plain, clean text.
  const look =
    style === "box"
      ? // BorderStyle 4 draws one box (BackColour) around the whole subtitle,
        // even when it wraps, matching the preview. "Outline" is the box
        // padding here; OutlineColour must be invisible, or libass also draws
        // a dark outline around every letter.
        { primary: WHITE, outlineColour: INVISIBLE, back: BOX, borderStyle: 4, outline: Math.round(fontSize * 0.25), shadow: 0 }
      : {
          primary: style === "yellow" ? YELLOW : WHITE,
          outlineColour: INVISIBLE,
          back: INVISIBLE,
          borderStyle: 1,
          outline: 0,
          shadow: 0,
        };

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0", // wrap long lines evenly
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Noto Sans Devanagari,${fontSize},${look.primary},${look.primary},${look.outlineColour},${look.back},0,0,0,0,100,100,0,0,${look.borderStyle},${look.outline},${look.shadow},2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = segments
    .filter((s) => s.text.trim() && s.end > s.start)
    .map((s) => `Dialogue: 0,${timestamp(s.start)},${timestamp(s.end)},Default,,0,0,0,,${escapeText(s.text)}`);

  return [...header, ...events, ""].join("\n");
}
