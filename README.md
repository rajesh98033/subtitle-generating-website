AI Video Subtitle Generator (.srt)
## Overview
This project is a full-stack web application that automatically generates subtitles from uploaded videos.
Users can upload a video file, and the system:

- extracts audio using FFmpeg
- transcribes speech with Whisper large-v3 (via the Groq API)
- generates timestamped subtitles (.srt / .vtt)
- lets users preview, edit, download, or burn the subtitles into the video

## Features
- Drag & drop upload of video **or audio** files, with an upload progress bar
- Automatic audio extraction using FFmpeg (compressed so ~1 hour fits Groq's 25 MB limit)
- Speech-to-text with Whisper large-v3: Nepali, Hindi, English, or auto-detect
- **Translate to English** mode (Nepali speech → English subtitles)
- Long Whisper segments are split into readable subtitle lines (configurable length)
- Live preview: generated captions play on top of your video
- **Edit subtitles** in the browser; click ▶ to play from any subtitle
- **Type Nepali with an English keyboard**: `khaanchhu` + space → `खान्छु`
- **Fix timings**: type a start/end time, nudge with ↑/↓, set it from the video with ⏱, add missing lines, or shift every subtitle earlier/later at once
- **Burn subtitles into the video**: download an MP4 with the subtitles drawn on it (3 styles, 3 sizes), ready for Facebook, TikTok or WhatsApp
- Export as **SRT**, **VTT** or plain **TXT**, or copy to clipboard
- Uploaded files are processed in a temp folder and deleted right after

## Tech Stack
Frontend
  - Next.js
  - React
  - Tailwind CSS

Backend
  - Next.js API Routes (Node.js)
  - File system handling (temp files, deleted after each request)

AI & Processing
  - FFmpeg (audio extraction, burning subtitles into video)
  - Groq API with Whisper large-v3, called directly from Node.js
  - See [How transcription evolved](#how-transcription-evolved) for the earlier Python versions

## Pipeline Architecture
Current flow:
```
Browser upload ─► Next.js API route (Node.js)
                    ├─ FFmpeg: extract audio (16 kHz mono MP3)
                    ├─ Groq Whisper API: speech → timestamped segments
                    └─ split long lines ─► browser editor ─► SRT / VTT / burned-in MP4
```

Original design:

<img width="507" height="1424" alt="mermaid-diagram" src="https://github.com/user-attachments/assets/c637c936-5a06-4950-b072-60e497d5d118" />

## Example Output
```
1
00:00:00,000 --> 00:00:06,240
मा खाना खान्छु, अनि तिस पछी मा साथिको गोर जान्छु
```

## Setup Instructions
1. Clone the repo
2. Install dependencies: `npm install` (no Python needed)
3. Install FFmpeg (a full build with libass, needed for burning subtitles into video; on Windows the gyan.dev "full" build works)
4. Copy `.env.example` to `.env.local` and fill in your key:
```
   GROQ_API_KEY=your_groq_api_key_here
   # optional, see .env.example for all usage limits
   DAILY_VIDEO_LIMIT=10
```
   Get a free API key at [console.groq.com](https://console.groq.com) (the free tier works).
   In production, set these in your host's environment variables instead of `.env.local`.
5. Run the app
   - npm run dev
   - Open: http://localhost:3000

## Usage limits
To keep the site usable for everyone on Groq's free tier, each visitor gets:
- videos up to **1 minute** and **150 MB**
- **10** subtitle generations and **10** video renders per day (reset at midnight Nepal time)

A shared daily cap (450 minutes of audio) stops the site just before Groq's own free-tier limit,
so users see a friendly message instead of an error. Failed attempts don't count.

Visitors are identified by a cookie, with a generous per-IP backstop (mobile networks share IPs).
Counters are kept in server memory, so no database or storage is needed; they reset if the server restarts.
Videos are never stored: they're deleted as soon as they're processed.

Every limit can be changed with an environment variable, see `.env.example`.

## How transcription evolved
The transcription step was rebuilt twice as the project grew:

| Version | How it worked | Why we moved on |
|---|---|---|
| 1. Local Whisper (Python) | OpenAI's open-source Whisper model running on my own machine, called from Node through a Python script | Slow without a GPU, and the smaller models that run on a laptop were not accurate enough for Nepali |
| 2. Groq API (Python script) | The same Python script, now sending the audio to Groq's hosted Whisper large-v3 with the `groq` package | Much faster and more accurate, but Python was still needed just to make one API call |
| 3. Groq API (Node.js), **current** | The Next.js API route calls Groq directly with Node's built-in `fetch` | See below |

Why we switched from the Python script to Node.js:
- **Simpler setup**: `npm install` + FFmpeg + an API key. No Python, `pip`, or `PYTHON_BIN` setting.
- **Easier deployment**: the server only needs Node.js and FFmpeg, so the production image is smaller and has fewer things to break.
- **Faster requests**: no separate Python process is started for every video.
- **Better error handling**: Node sees Groq's HTTP status codes directly (invalid key, rate limit, file too large) and can show users a clear message, instead of parsing text printed by a script.
- **One language** across the whole backend, with no new dependencies (Groq's API is OpenAI-compatible, so it's a single `fetch` request).

## Limitations
- Groq free tier allows ~8 hours of audio per day (~2 hours per hour); the default limits stay under this
- Accuracy depends on audio quality
- Designed to run on a single server: usage counters are kept in memory

## Future Improvements
- Improve accuracy using larger and better models
- Production deployment: Dockerfile (Node.js + FFmpeg) and hosting setup

## Key Learnings
- Built an end-to-end AI pipeline (not just UI)
- Integrated a Node.js backend with a Python ML script, then simplified it to a direct API call from Node when moving toward production
- Worked with media processing using FFmpeg
- Implemented real-world subtitle formatting (.srt)
- Understood limitations of speech models in low-resource languages

## Credits
- Burned-in subtitles use [Noto Sans Devanagari](https://github.com/notofonts/devanagari), bundled in `assets/fonts` under the SIL Open Font License (see `assets/fonts/OFL.txt`).
