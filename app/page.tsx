"use client";

import { useState } from "react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Subtitle Generator</h1>
        <p className="text-sm text-white/70 mb-6">
          Upload a video to generate English subtitles.
        </p>

        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
        />

        {selectedFile && (
          <div className="mt-4 rounded-lg bg-white/10 p-3 text-sm">
            Selected file: <span className="font-medium">{selectedFile.name}</span>
          </div>
        )}

        <button
          disabled
          className="mt-6 w-full rounded-lg bg-white/20 px-4 py-2 font-semibold text-white cursor-not-allowed"
        >
          Upload Coming Next
        </button>
      </div>
    </main>
  );
}