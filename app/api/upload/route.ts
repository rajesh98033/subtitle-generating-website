import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds - Math.floor(seconds)) * 1000);

  const pad = (num: number, size: number) => String(num).padStart(size, "0");

  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)},${pad(millis, 3)}`;
}

function generateSRT(segments: Array<{ start: number; end: number; text: string }>): string {
  return segments
    .map((segment, index) => {
      return `${index + 1}
${formatTime(segment.start)} --> ${formatTime(segment.end)}
${segment.text.trim()}
`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No video file uploaded." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), "uploads");
    const audioDir = path.join(process.cwd(), "audio");
    const subtitlesDir = path.join(process.cwd(), "subtitles");

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    if (!fs.existsSync(subtitlesDir)) fs.mkdirSync(subtitlesDir, { recursive: true });

    const timestamp = Date.now();
    const originalExt = path.extname(file.name) || ".mp4";
    const baseName = path.basename(file.name, originalExt).replace(/[^\w\-]/g, "_");

    const videoFileName = `${timestamp}-${baseName}${originalExt}`;
    const videoPath = path.join(uploadsDir, videoFileName);
    fs.writeFileSync(videoPath, buffer);

    const audioFileName = `${timestamp}-${baseName}.wav`;
    const audioPath = path.join(audioDir, audioFileName);

    const ffmpegCommand = `ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 "${audioPath}"`;
    await execAsync(ffmpegCommand);

    const pythonCommand = `python python/transcribe.py "${audioPath}"`;
    //const pythonCommand = `set GROQ_API_KEY=${process.env.GROQ_API_KEY} && python python/transcribe.py "${audioPath}"`;
    const { stdout, stderr } = await execAsync(pythonCommand, {
    env: {
      ...process.env,
      GROQ_API_KEY: process.env.GROQ_API_KEY?.trim(),
    }
    });

    if (stderr) {
      console.error("Python stderr:", stderr);
    }

    const transcriptionResult = JSON.parse(stdout);
    const segments = transcriptionResult.segments || [];
    const transcript = transcriptionResult.text || "";

    const srtContent = generateSRT(segments);
    const srtFileName = `${timestamp}-${baseName}.srt`;
    const srtPath = path.join(subtitlesDir, srtFileName);

    fs.writeFileSync(srtPath, srtContent, "utf-8");

    return NextResponse.json({
      message: "Video processed successfully.",
      videoFileName,
      audioFileName,
      srtFileName,
      transcript,
      srtContent,
    });
  } catch (error) {
    console.error("Processing error:", error);

    return NextResponse.json(
      { error: "Something went wrong while processing the video." },
      { status: 500 }
    );
  }
}