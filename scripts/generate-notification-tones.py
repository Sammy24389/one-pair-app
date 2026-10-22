"""Generate original short notification notes; Python standard library only."""
import math
from pathlib import Path
import struct
import wave

OUTPUT = Path(__file__).resolve().parents[1] / 'android/app/src/main/res/raw'
TONES = [
    ('chime', 0.8, [(0, 659.25), (0.16, 987.77)]),
    ('bell', 0.95, [(0, 880), (0.18, 1174.66)]),
    ('soft', 0.7, [(0, 523.25), (0.13, 659.25)]),
]
OUTPUT.mkdir(exist_ok=True)
for name, duration, notes in TONES:
    frames = bytearray()
    for i in range(int(duration * 24000)):
        t, value = i / 24000, 0
        for start, frequency in notes:
            elapsed = t - start
            if elapsed >= 0:
                envelope = min(1, elapsed / 0.012) * math.exp(-elapsed * (7 if name == 'soft' else 5))
                value += envelope * (math.sin(2 * math.pi * frequency * elapsed) + 0.16 * math.sin(2 * math.pi * frequency * 2.01 * elapsed))
        value *= min(1, (duration - t) / 0.04) * 0.24
        frames.extend(struct.pack('<h', int(max(-1, min(1, value)) * 32767)))
    with wave.open(str(OUTPUT / f'notification_{name}.wav'), 'wb') as audio:
        audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        audio.writeframes(frames)
