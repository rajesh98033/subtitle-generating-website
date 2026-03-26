AI Video Subtitle Generator (.srt)
## Overview
This project is a full-stack web application that automatically generates subtitles from uploaded videos.
Users can upload a video file, and the system:

- extracts audio using FFmpeg
- transcribes speech using OpenAI Whisper (local)
- generates timestamped subtitles in .srt format
- allows users to preview and download subtitles

## Features
- Upload video files
- Automatic audio extraction using FFmpeg
- Speech-to-text transcription using Whisper
- Subtitle generation in standard .srt format
- downloadable subtitle file
- Video Preview before processing
- Fully local processing
- No API cost

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
3. Install FFmpeg
4. Install Python & Groq package
   - pip install groq (I am using free tier)
5. Create a `.env.local` file in the project root:
```
   GROQ_API_KEY=your_groq_api_key_here
```
   Get a free API key at [console.groq.com](https://console.groq.com)
5. Run the app
   - npm run dev
   - Open: http://localhost:3000

## Limitations
- Groq free tier allows ~2 hours of audio per day
- Accuracy depends on audio quality
- Not optimized for large-scale or production use

## Future Improvements
- Translation support (Nepali to English)
- Improve accuracy using larger and better models
- Deploy with cloud-based inference
- Subtitle embedding directly into video

## Key Learnings
- Built an end-to-end AI pipeline (not just UI)
- Integrated Node.js backend with Python ML script
- Worked with media processing using FFmpeg
- Implemented real-world subtitle formatting (.srt)
- Understood limitations of speech models in low-resource languages



