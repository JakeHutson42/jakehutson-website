"""Original PCM motorcycle cues. No recordings, downloads or runtime synthesis needed."""

import math
import random
import struct
import wave

RATE = 22050


def generate(directory):
    directory.mkdir(parents=True, exist_ok=True)
    sounds = {}
    for name, seconds, frequency in [
        ("idle", 2, 24),
        ("load", 2, 48),
        ("gravel", 2, 0),
        ("land", 0.24, 70),
        ("checkpoint", 0.32, 660),
        ("finish", 0.8, 440),
    ]:
        rng = random.Random("quarry-audio-2:" + name)
        samples = []
        noise = 0
        count = round(seconds * RATE)
        for i in range(count):
            t = i / RATE
            noise = noise * 0.75 + rng.uniform(-1, 1) * 0.25
            if name in ("idle", "load"):
                # Integer cycles make the harmonic loop seamless; noise fades at ends.
                pulse = sum(math.sin(math.tau * frequency * k * t) / k**1.3 for k in range(1, 18))
                value = pulse * 0.25 + noise * 0.07 * math.sin(math.pi * i / (count - 1)) ** 2
            elif name == "gravel":
                value = noise * 0.6 * math.sin(math.pi * i / (count - 1)) ** 2
            elif name == "land":
                value = (math.sin(math.tau * frequency * t) + noise) * 0.4 * math.exp(-t * 22)
            else:
                pitch = frequency * (
                    1 if name == "checkpoint" else (1, 1.25, 1.5, 2)[min(3, int(t * 5))]
                )
                value = (
                    math.sin(math.tau * pitch * t) * 0.22 * math.sin(math.pi * i / (count - 1)) ** 2
                )
            samples.append(round(max(-0.9, min(0.9, value)) * 32767))
        path = directory / f"{name}.wav"
        with wave.open(str(path), "wb") as output:
            output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
            output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        sounds[name] = f"audio/{name}.wav"
    return sounds


def validate_audio(path):
    with wave.open(str(path), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, RATE):
            raise ValueError(f"{path}: unexpected PCM format")
        count = audio.getnframes()
        if not RATE / 10 <= count <= RATE * 3:
            raise ValueError(f"{path}: invalid duration")
        samples = struct.unpack(f"<{count}h", audio.readframes(count))
        if max(abs(s) for s in samples) >= 32767:
            raise ValueError(f"{path}: clipped samples")
