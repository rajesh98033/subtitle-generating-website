import sys, os
import json
from groq import Groq

# Fix Windows encoding for Devanagari script
# But if you're on Linux/Mac, you can probably skip this part
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

audio_path = sys.argv[1]

with open(audio_path, "rb") as audio_file:
    transcription = client.audio.transcriptions.create(
        file=(audio_path, audio_file.read()),
        model="whisper-large-v3",
        language="ne",          # force Nepali language
        response_format="verbose_json",  # needed to get segments with timestamps
        timestamp_granularities=["segment"]
    )

result = {
    "text": transcription.text,
    "segments": [
        {
            "start": seg["start"],    # use dict access
            "end": seg["end"],        # use dict access
            "text": seg["text"]       # use dict access
        }
        for seg in transcription.segments
    ]
}

print(json.dumps(result, ensure_ascii=False))  # ensure_ascii=False is important for Devanagari script!