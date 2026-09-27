AI Video Subtitle Generator (.srt)
## Overview
This project is a full-stack web application that automatically generates subtitles from uploaded videos.
Users can upload a video file, and the system:

- extracts audio using FFmpeg
- transcribes speech using OpenAI Whisper (local)
- generates timestamped subtitles in .srt format
- allows users to preview and download subtitles

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
  - Next.js API Routes
  - Nodes.js
  - File system handling

AI & Processing
  - FFmpeg (audio extraction)
  - OpenAI Whisper (local transcripiton via Python) (**Before)
  - Groq API with Whisper large-v3 (cloud transcription via python)

## Pipeline Architecture
<img width="507" height="1424" alt="mermaid-diagram" src="https://github.com/user-attachments/assets/c637c936-5a06-4950-b072-60e497d5d118" />

## Example Output
```
1
00:00:00,000 --> 00:00:06,240
मा खाना खान्छु, अनि तिस पछी मा साथिको गोर जान्छु
```

## Setup Instructions
1. Clone the repo
2. Install dependencies
3. Install FFmpeg (a full build with libass, needed for burning subtitles into video; on Windows the gyan.dev "full" build works)
4. Install Python & the Groq package
   - `pip install -r python/requirements.txt` (free tier works)
5. Copy `.env.example` to `.env.local` and fill in your key:
```
   GROQ_API_KEY=your_groq_api_key_here
   # optional
   PYTHON_BIN=python3      # defaults to "python" on Windows, "python3" elsewhere
   MAX_UPLOAD_MB=500
```
   Get a free API key at [console.groq.com](https://console.groq.com)
6. Run the app
   - npm run dev
   - Open: http://localhost:3000

## Limitations
- Groq free tier allows ~2 hours of audio per day, and ~1 hour per file (25 MB audio limit)
- Accuracy depends on audio quality
- Not optimized for large-scale or production use

## Future Improvements
- Improve accuracy using larger and better models
- Deploy with cloud-based inference

## Key Learnings
- Built an end-to-end AI pipeline (not just UI)
- Integrated Node.js backend with Python ML script
- Worked with media processing using FFmpeg
- Implemented real-world subtitle formatting (.srt)
- Understood limitations of speech models in low-resource languages

## Credits
- Burned-in subtitles use [Noto Sans Devanagari](https://github.com/notofonts/devanagari), bundled in `assets/fonts` under the SIL Open Font License (see `assets/fonts/OFL.txt`).
