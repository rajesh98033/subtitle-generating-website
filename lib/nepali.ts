/**
 * Romanized Nepali → Devanagari transliteration, so users can fix Nepali
 * subtitles with a normal English keyboard ("khaanchhu" → "खान्छु").
 *
 * Rules follow the common "Nepali Unicode Romanized" style:
 *   - consonants: k kh g gh ch chh j jh t th d dh n p ph b bh m y r l w s sh h
 *   - retroflex:  T Th D Dh N,  ष = Sh
 *   - vowels:     a aa/A i ii/ee/I u uu/oo/U e ai o au R(ऋ)
 *   - signs:      M = ं   ~ = ँ   H = ः   \ = ् (force half letter at word end)
 * Consonants written back to back are joined ("nt" → न्त); a word-final
 * consonant keeps its inherent "a" ("nepaal" → नेपाल).
 */

const HALANT = "्";

const CONSONANTS: Record<string, string> = {
  GY: "ज्ञ",
  jny: "ज्ञ",
  ksh: "क्ष",
  chh: "छ",
  kh: "ख",
  gh: "घ",
  NG: "ङ",
  ch: "च",
  jh: "झ",
  NY: "ञ",
  Th: "ठ",
  Dh: "ढ",
  th: "थ",
  dh: "ध",
  ph: "फ",
  bh: "भ",
  Sh: "ष",
  sh: "श",
  k: "क",
  g: "ग",
  c: "च",
  j: "ज",
  z: "ज",
  T: "ट",
  D: "ड",
  N: "ण",
  t: "त",
  d: "द",
  n: "न",
  p: "प",
  f: "फ",
  b: "ब",
  m: "म",
  y: "य",
  r: "र",
  l: "ल",
  w: "व",
  v: "व",
  s: "स",
  h: "ह",
};

// [independent form, vowel sign after a consonant]
const VOWELS: Record<string, [string, string]> = {
  aa: ["आ", "ा"],
  ai: ["ऐ", "ै"],
  au: ["औ", "ौ"],
  ii: ["ई", "ी"],
  ee: ["ई", "ी"],
  uu: ["ऊ", "ू"],
  oo: ["ऊ", "ू"],
  A: ["आ", "ा"],
  I: ["ई", "ी"],
  U: ["ऊ", "ू"],
  R: ["ऋ", "ृ"],
  a: ["अ", ""],
  i: ["इ", "ि"],
  u: ["उ", "ु"],
  e: ["ए", "े"],
  o: ["ओ", "ो"],
};

const SIGNS: Record<string, string> = {
  M: "ं",
  "~": "ँ",
  H: "ः",
};

const MAX_TOKEN = 3;

/** Characters that make up a romanized word the user is still typing. */
export const ROMAN_WORD = /[A-Za-z~\\]+$/;

export function transliterate(input: string): string {
  let out = "";
  let pendingConsonant = false; // last output was a consonant with no vowel yet
  let i = 0;

  while (i < input.length) {
    let matched = false;

    for (let len = Math.min(MAX_TOKEN, input.length - i); len > 0 && !matched; len--) {
      const raw = input.slice(i, i + len);
      // Uppercase only has meaning for the specific keys above; otherwise
      // treat it like lowercase so "Nepaal" still works.
      for (const token of raw === raw.toLowerCase() ? [raw] : [raw, raw.toLowerCase()]) {
        if (CONSONANTS[token]) {
          out += (pendingConsonant ? HALANT : "") + CONSONANTS[token];
          pendingConsonant = true;
        } else if (VOWELS[token]) {
          const [independent, sign] = VOWELS[token];
          out += pendingConsonant ? sign : independent;
          pendingConsonant = false;
        } else if (SIGNS[token]) {
          out += SIGNS[token];
          pendingConsonant = false;
        } else if (token === "\\") {
          if (pendingConsonant) out += HALANT;
          pendingConsonant = false;
        } else {
          continue;
        }
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      out += input[i];
      pendingConsonant = false;
      i++;
    }
  }

  return out;
}

export const TYPING_GUIDE: Array<[string, string]> = [
  ["ma khaanaa khaanchhu", "म खाना खान्छु"],
  ["namaste", "नमस्ते"],
  ["aa  ii  uu", "ा  ी  ू"],
  ["T  Th  D  Dh  N", "ट  ठ  ड  ढ  ण"],
  ["sh  Sh  ksh  GY", "श  ष  क्ष  ज्ञ"],
  ["M  ~  H", "ं  ँ  ः"],
  ["garchhan\\", "गर्छन्"],
  [".", "।"],
];
