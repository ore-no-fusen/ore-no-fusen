"""
効果音生成スクリプト (単発)

責務:
- 開発用: 特定のクリック音(create_calm.wav)を生成する
"""

import wave
import math
import struct
import os

def generate_crisp_sound(filename):
    sample_rate = 44100
    duration = 0.08 # 80ms, very short
    n_samples = int(sample_rate * duration)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        for i in range(n_samples):
            t = float(i) / sample_rate
            
            # Very sharp envelope
            # Attack: 2ms
            if t < 0.002:
                env = t / 0.002
            else:
                # Decay: exponential
                env = math.exp(-(t - 0.002) * 40)
            
            # "Kachi" tone: High pitch click
            # Mixture of 2000Hz and 4000Hz
            value = math.sin(2 * math.pi * 2000 * t)
            value += 0.3 * math.sin(2 * math.pi * 4000 * t)
            
            sample = int(value * env * 32767 * 0.6)
            
            # Clamp
            sample = max(-32767, min(32767, sample))
            
            wav_file.writeframes(struct.pack('h', sample))

output_path = os.path.join('public', 'sounds', 'create_calm.wav')
os.makedirs(os.path.dirname(output_path), exist_ok=True)
generate_crisp_sound(output_path)
print(f"Generated: {output_path}")
