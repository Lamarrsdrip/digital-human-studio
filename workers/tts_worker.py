#!/usr/bin/env python3
"""
tts_worker.py — Text-to-Speech worker for Digital Human Studio.
Tries providers in order: piper → system (macOS say) → espeak

Usage:
  python3 tts_worker.py --text "Hello world" --output /path/to/out.wav
  python3 tts_worker.py --text "Hello world" --output /path/to/out.wav --voice en_US-amy-medium --provider piper
"""

import argparse
import sys
import os
import json
import subprocess
import tempfile


def run(cmd, timeout=60):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or f'Command failed: {cmd[0]}')
    return result.stdout


def tts_piper(text, output_wav, voice='en_US-amy-medium', piper_exe='piper'):
    """Use Piper local TTS — high quality, no internet needed."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    voices_dir = os.path.join(script_dir, 'voices')
    model_file = os.path.join(voices_dir, f'{voice}.onnx')
    config_file = os.path.join(voices_dir, f'{voice}.onnx.json')

    if not os.path.exists(model_file):
        raise FileNotFoundError(f'Piper voice model not found: {model_file}\nRun: ./setup.sh piper')

    proc = subprocess.run(
        [piper_exe, '--model', model_file, '--output_file', output_wav],
        input=text, capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f'Piper failed: {proc.stderr}')
    if not os.path.exists(output_wav) or os.path.getsize(output_wav) < 100:
        raise RuntimeError('Piper produced empty output')


def tts_macos_say(text, output_wav):
    """macOS built-in TTS — always available on Mac, decent quality."""
    with tempfile.NamedTemporaryFile(suffix='.aiff', delete=False) as f:
        aiff_path = f.name
    try:
        subprocess.run(['say', '-o', aiff_path, '--data-format=LEF32@22050', text],
                       capture_output=True, timeout=120, check=True)
        subprocess.run(['ffmpeg', '-y', '-i', aiff_path, '-ar', '16000', '-ac', '1', output_wav],
                       capture_output=True, timeout=30, check=True)
    finally:
        if os.path.exists(aiff_path):
            os.unlink(aiff_path)


def tts_espeak(text, output_wav):
    """eSpeak fallback — robotic but always works if installed."""
    subprocess.run(
        ['espeak', '-w', output_wav, '--speed=150', text],
        capture_output=True, timeout=60, check=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--voice', default='en_US-amy-medium')
    parser.add_argument('--provider', default='auto')  # auto | piper | say | espeak
    parser.add_argument('--piper', default='piper')
    args = parser.parse_args()

    text = args.text.strip()
    if not text:
        print(json.dumps({'ok': False, 'error': 'Empty text'}))
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    errors = []
    provider = args.provider

    if provider in ('auto', 'piper'):
        try:
            tts_piper(text, args.output, voice=args.voice, piper_exe=args.piper)
            print(json.dumps({'ok': True, 'provider': 'piper', 'output': args.output}))
            return
        except Exception as e:
            errors.append(f'piper: {e}')
            if provider == 'piper':
                print(json.dumps({'ok': False, 'error': str(e), 'tried': errors}))
                sys.exit(1)

    if provider in ('auto', 'say'):
        try:
            tts_macos_say(text, args.output)
            if os.path.exists(args.output) and os.path.getsize(args.output) > 100:
                print(json.dumps({'ok': True, 'provider': 'macos_say', 'output': args.output}))
                return
        except Exception as e:
            errors.append(f'macos_say: {e}')
            if provider == 'say':
                print(json.dumps({'ok': False, 'error': str(e), 'tried': errors}))
                sys.exit(1)

    if provider in ('auto', 'espeak'):
        try:
            tts_espeak(text, args.output)
            if os.path.exists(args.output) and os.path.getsize(args.output) > 100:
                print(json.dumps({'ok': True, 'provider': 'espeak', 'output': args.output}))
                return
        except Exception as e:
            errors.append(f'espeak: {e}')

    print(json.dumps({'ok': False, 'error': 'All TTS providers failed', 'tried': errors}))
    sys.exit(1)


if __name__ == '__main__':
    main()
