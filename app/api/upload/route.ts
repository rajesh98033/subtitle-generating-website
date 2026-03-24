import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const safeFileName = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadsDir, safeFileName);

    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({
      message: "Video uploaded successfully.",
      fileName: safeFileName,
    });
  } catch (error) {
    console.error("Upload error:", error);

    return NextResponse.json(
      { error: "Something went wrong while uploading." },
      { status: 500 }
    );
  }
}