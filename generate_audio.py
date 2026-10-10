import subprocess
import os

def create_sample_audio():
    out_path = os.path.abspath("demo_site/audio_sample.wav")
    text = "Hello everyone. In my free time, I really love reading science fiction books. It helps me explore new worlds and relax after school."
    
    ps_script = f"""
    Add-Type -AssemblyName System.Speech
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $speaker.SetOutputToWaveFile('{out_path}')
    $speaker.Speak('{text}')
    $speaker.Dispose()
    """
    
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], check=True)
    print(f"Generated audio file: {out_path} (size: {os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    create_sample_audio()
