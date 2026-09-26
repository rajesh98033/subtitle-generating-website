"""Transcribe (or translate to English) an audio file with Groq's Whisper API.

Usage:
    python transcribe.py <audio_path> [--language ne] [--task transcribe|translate]

Prints a JSON object {"text": ..., "language": ..., "segments": [{start, end, text}]}
to stdout. On failure, prints {"error": ...} to stdout and exits with code 1.
"""

import argparse
import json
import os
import sys

# Make sure Devanagari (and any other script) survives stdout on Windows.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

MODEL = "whisper-large-v3"


def fail(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))
    sys.exit(1)


def get(obj, key, default=None):
    """Segments may come back as dicts or objects depending on SDK version."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path")
    parser.add_argument("--language", default="ne", help="ISO-639-1 code, or 'auto'")
    parser.add_argument("--task", choices=["transcribe", "translate"], default="transcribe")
    args = parser.parse_args()

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        fail("GROQ_API_KEY is not set. Add it to .env.local.")

    try:
        from groq import Groq
    except ImportError:
        fail("The 'groq' Python package is not installed. Run: pip install -r python/requirements.txt")

    client = Groq(api_key=api_key)

    try:
        with open(args.audio_path, "rb") as audio_file:
            payload = (os.path.basename(args.audio_path), audio_file.read())

        if args.task == "translate":
            # Whisper translation always outputs English.
            result = client.audio.translations.create(
                file=payload,
                model=MODEL,
                response_format="verbose_json",
            )
        else:
            options = {
                "file": payload,
                "model": MODEL,
                "response_format": "verbose_json",
                "timestamp_granularities": ["segment"],
            }
            if args.language and args.language != "auto":
                options["language"] = args.language
            result = client.audio.transcriptions.create(**options)
    except Exception as exc:  # surface API errors (rate limit, file too large, ...)
        fail(f"Transcription request failed: {exc}")

    segments = [
        {
            "start": float(get(seg, "start", 0)),
            "end": float(get(seg, "end", 0)),
            "text": str(get(seg, "text", "")).strip(),
        }
        for seg in (get(result, "segments") or [])
    ]

    print(
        json.dumps(
            {
                "text": get(result, "text", ""),
                "language": get(result, "language"),
                "segments": segments,
            },
            ensure_ascii=False,  # keep Devanagari readable
        )
    )


if __name__ == "__main__":
    main()
