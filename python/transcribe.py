import sys
import json
import whisper

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file path provided."}))
        sys.exit(1)

    audio_path = sys.argv[1]

    model = whisper.load_model("base")

    result = model.transcribe(
        audio_path,
        language="en",
        task="transcribe",
        fp16=False
    )

    output = {
        "text": result.get("text", ""),
        "segments": result.get("segments", [])
    }

    print(json.dumps(output, ensure_ascii=False))

if __name__ == "__main__":
    main()