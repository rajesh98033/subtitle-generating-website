"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [srtContent, setSrtContent] = useState("");
  const [srtFileName, setSrtFileName] = useState("subtitles.srt");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;

    if (videoURL) {
      URL.revokeObjectURL(videoURL);
    }

    setSelectedFile(file);
    setMessage("");
    setTranscript("");
    setSrtContent("");
    setSrtFileName("subtitles.srt");

    if (file) {
      const previewURL = URL.createObjectURL(file);
      setVideoURL(previewURL);
    } else {
      setVideoURL("");
    }
  };

  useEffect(() => {
    return () => {
      if (videoURL) {
        URL.revokeObjectURL(videoURL);
      }
    };
  }, [videoURL]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please select a video first.");
      return;
    }

    try {
      setIsUploading(true);
      setMessage("Uploading and processing...");
      setTranscript("");
      setSrtContent("");

      const formData = new FormData();
      formData.append("video", selectedFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Upload failed.");
        return;
      }

      setTranscript(data.transcript || "");
      setSrtContent(data.srtContent || "");
      setSrtFileName(data.srtFileName || "subtitles.srt");
      setMessage(data.message || "Video processed successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadSRT = () => {
    if (!srtContent) return;

    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = srtFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h1 className="mb-2 text-2xl font-bold">Subtitle Generator</h1>
        <p className="mb-6 text-sm text-white/70">
          Upload an English video to generate subtitle text and an SRT file.
        </p>

        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
        />

        {selectedFile && (
          <div className="mt-4 rounded-lg bg-white/10 p-3 text-sm space-y-1">
            <p>
              <span className="font-semibold">File Name:</span>{" "}
              {selectedFile.name}
            </p>
            <p>
              <span className="font-semibold">File Type:</span>{" "}
              {selectedFile.type || "Unknown"}
            </p>
            <p>
              <span className="font-semibold">File Size:</span>{" "}
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        )}

        {videoURL && (
          <div className="mt-4">
            <video
              src={videoURL}
              controls
              className="w-full rounded-lg border border-white/10"
            />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="mt-6 w-full rounded-lg bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          {isUploading ? "Processing..." : "Upload and Generate Subtitles"}
        </button>

        {message && <p className="mt-4 text-sm text-white/80">{message}</p>}

        {transcript && (
          <div className="mt-6 rounded-lg bg-white/10 p-4 text-sm">
            <p className="mb-2 font-semibold">Transcript</p>
            <p className="whitespace-pre-wrap break-words">{transcript}</p>
          </div>
        )}

        {srtContent && (
          <div className="mt-6 rounded-lg bg-white/10 p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-semibold">Generated SRT</p>
              <button
                onClick={handleDownloadSRT}
                className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black"
              >
                Download SRT
              </button>
            </div>

            <pre className="whitespace-pre-wrap break-words overflow-x-auto">
              {srtContent}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}