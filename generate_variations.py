import wave
import math
import struct
import os
import random

def save_wav(filename, samples, sample_rate=44100):
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for s in samples:
            wav_file.writeframes(struct.pack('h', int(max(-32767, min(32767, s)))))

def generate_variations(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    sample_rate = 44100
    
    # 1. Mechanical Click (High pitch, Blue switch style)
    samples = []
    for i in range(int(sample_rate * 0.1)):
        t = float(i) / sample_rate
        env = math.exp(-t * 80) if t > 0.002 else t/0.002
        val = math.sin(2 * math.pi * 2200 * t) + 0.5 * math.sin(2 * math.pi * 3500 * t)
        samples.append(val * env * 32767 * 0.6)
    save_wav(os.path.join(output_dir, 'click_mechanical.wav'), samples)

    # 2. Thocky Click (Lower pitch, Brown/Red switch style)
    samples = []
    for i in range(int(sample_rate * 0.15)):
        t = float(i) / sample_rate
        env = math.exp(-t * 40) if t > 0.005 else t/0.005
        # Lower frequency, more body
        val = math.sin(2 * math.pi * 400 * t) + 0.3 * math.sin(2 * math.pi * 800 * t) + 0.1 * (random.random() - 0.5)
        samples.append(val * env * 32767 * 0.7)
    save_wav(os.path.join(output_dir, 'click_thock.wav'), samples)

    # 3. Glassy Click (High, clean, minimal harmonics)
    samples = []
    for i in range(int(sample_rate * 0.1)):
        t = float(i) / sample_rate
        env = math.exp(-t * 60)
        val = math.sin(2 * math.pi * 2800 * t)
        samples.append(val * env * 32767 * 0.5)
    save_wav(os.path.join(output_dir, 'click_glassy.wav'), samples)

    # 4. Bubble / Water drop
    samples = []
    for i in range(int(sample_rate * 0.15)):
        t = float(i) / sample_rate
        env = math.exp(-t * 30)
        # Frequency sweep for "bloop" effect
        freq = 800 + 400 * math.sin(2 * math.pi * 20 * t)
        val = math.sin(2 * math.pi * freq * t)
        samples.append(val * env * 32767 * 0.6)
    save_wav(os.path.join(output_dir, 'click_bubble.wav'), samples)

    # 5. Soft Tactile (Muted)
    samples = []
    for i in range(int(sample_rate * 0.1)):
        t = float(i) / sample_rate
        env = math.exp(-t * 50) if t > 0.003 else t/0.003
        noise = (random.random() - 0.5) * 0.4
        val = math.sin(2 * math.pi * 300 * t) * 0.8 + noise
        samples.append(val * env * 32767 * 0.6)
    save_wav(os.path.join(output_dir, 'click_soft.wav'), samples)

    # 6. Typewriter (Mechanical CLACK)
    samples = []
    for i in range(int(sample_rate * 0.12)):
        t = float(i) / sample_rate
        env = math.exp(-t * 30)
        # Metallic overtone
        val = math.sin(2 * math.pi * 1000 * t) + 0.5 * math.sin(2 * math.pi * 2500 * t) + 0.3 * (random.random()-0.5)
        samples.append(val * env * 32767 * 0.7)
    save_wav(os.path.join(output_dir, 'click_typewriter.wav'), samples)

    # 7. Switch (Console snap)
    samples = []
    for i in range(int(sample_rate * 0.08)):
        t = float(i) / sample_rate
        env = math.exp(-t * 60)
        # Sharp snap
        val = math.sin(2 * math.pi * 1500 * t) + math.sin(2 * math.pi * 3000 * t)
        samples.append(val * env * 32767 * 0.6)
    save_wav(os.path.join(output_dir, 'click_switch.wav'), samples)

    # 8. Wood (Mokugyo style)
    samples = []
    for i in range(int(sample_rate * 0.1)):
        t = float(i) / sample_rate
        env = math.exp(-t * 40)
        # Hollow square-ish wave
        val = math.sin(2 * math.pi * 400 * t) + 0.2 * math.sin(2 * math.pi * 1200 * t)
        samples.append(val * env * 32767 * 0.8)
    save_wav(os.path.join(output_dir, 'click_wood.wav'), samples)

    # 9. Camera (Shutter)
    samples = []
    for i in range(int(sample_rate * 0.15)):
        t = float(i) / sample_rate
        env = math.exp(-t * 20)
        # Noise burst
        val = (random.random() - 0.5) * math.sin(2 * math.pi * 100 * t)
        samples.append(val * env * 32767 * 0.5)
    save_wav(os.path.join(output_dir, 'click_camera.wav'), samples)

    # 10. Modern UI (System beep)
    samples = []
    for i in range(int(sample_rate * 0.15)):
        t = float(i) / sample_rate
        env = math.exp(-t * 25)
        # Clean sine with pitch drop
        freq = 880 * math.exp(-t * 5)
        val = math.sin(2 * math.pi * freq * t)
        samples.append(val * env * 32767 * 0.4)
    save_wav(os.path.join(output_dir, 'click_modern.wav'), samples)

    print(f"Generated 10 variations in {output_dir}")

generate_variations(os.path.join('public', 'sounds', 'variations'))
