"""Prepare downloaded OGA WAVs as compact, click-free 44.1 kHz mono loops.

Inputs (download separately; see games/drift/sounds/CREDITS.txt):
  idle-source.wav, tyres-source.wav, engine-loop/engine-loop-1-normalized.wav
Run once after updating source recordings. No network or third-party dependencies.
"""
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'games/drift/sounds'


def prepare(source, destination):
    with wave.open(str(ROOT / source), 'rb') as audio:
        channels, width, rate = audio.getnchannels(), audio.getsampwidth(), audio.getframerate()
        raw = audio.readframes(audio.getnframes())
    frames = []
    for i in range(0, len(raw), width * channels):
        frames.append(sum(int.from_bytes(raw[i+c*width:i+(c+1)*width], 'little', signed=True)
                          / (2 ** (width*8-1)) for c in range(channels)) / channels)
    # Two-pole lowpass before downsampling; retain tyre texture without aliasing.
    if rate > 44100:
        alpha = 1 - math.exp(-2 * math.pi * 10000 / rate)
        first = second = frames[0]
        for i, value in enumerate(frames):
            first += alpha * (value - first)
            second += alpha * (first - second)
            frames[i] = second
        step = rate / 44100
        frames = [frames[int(i*step)] * (1-i*step % 1)
                  + frames[min(int(i*step)+1,len(frames)-1)] * (i*step % 1)
                  for i in range(int(len(frames)/step))]
    mean = sum(frames) / len(frames)
    frames = [v-mean for v in frames]
    # Overlap the tail with the head, removing the duplicate section. This keeps
    # constant energy through the boundary instead of fading to silence each lap.
    overlap = 2205
    for i in range(overlap):
        mix = i / (overlap-1)
        frames[-overlap+i] = frames[-overlap+i]*(1-mix) + frames[i]*mix
    frames = frames[overlap:]
    scale = 0.88/max(abs(v) for v in frames)
    with wave.open(str(ROOT / destination), 'wb') as audio:
        audio.setparams((1,2,44100,len(frames),'NONE','not compressed'))
        audio.writeframes(struct.pack(f'<{len(frames)}h', *(round(v*scale*32767) for v in frames)))
    print(f'{destination}: {len(frames)/44100:.2f}s, {len(frames)*2/1024:.0f} KiB')


if __name__ == '__main__':
    prepare('idle-source.wav', 'engine-idle.wav')
    prepare('engine-loop/engine-loop-1-normalized.wav', 'engine-rev.wav')
    prepare('tyres-source.wav', 'tyres.wav')
