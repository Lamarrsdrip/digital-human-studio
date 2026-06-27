#!/usr/bin/env python3
"""
lipsync_worker.py — Lip sync worker for Digital Human Studio.
Supports: wav2lip | sadtalker | static (ffmpeg fallback)

Usage:
  python3 lipsync_worker.py --provider wav2lip --face face.jpg --audio speech.wav --output out.mp4
  python3 lipsync_worker.py --provider sadtalker --face face.jpg --audio speech.wav --output out.mp4
  python3 lipsync_worker.py --provider static --face face.jpg --audio speech.wav --output out.mp4
"""

import argparse
import sys
import os
import json
import subprocess
import tempfile
import shutil


def run(cmd, timeout=600, cwd=None):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or '').strip()[-800:])
    return result.stdout.strip()


def wav2lip(face_path, audio_path, output_path, wav2lip_dir=None):
    if not wav2lip_dir:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        wav2lip_dir = os.path.join(os.path.dirname(script_dir), 'Wav2Lip')

    inference = os.path.join(wav2lip_dir, 'inference.py')
    checkpoint = os.path.join(wav2lip_dir, 'checkpoints', 'wav2lip_gan.pth')

    if not os.path.exists(inference):
        raise FileNotFoundError(f'Wav2Lip not found at {wav2lip_dir}. Run: ./setup.sh wav2lip')
    if not os.path.exists(checkpoint):
        raise FileNotFoundError(f'Wav2Lip checkpoint not found: {checkpoint}. Run: ./setup.sh wav2lip')

    # Wav2Lip writes to a fixed output path by default, so we redirect
    tmp_out = output_path.replace('.mp4', '_tmp_wav2lip.mp4')
    run([
        sys.executable, inference,
        '--checkpoint_path', checkpoint,
        '--face', face_path,
        '--audio', audio_path,
        '--outfile', tmp_out,
        '--resize_factor', '1',
        '--nosmooth',
    ], timeout=900, cwd=wav2lip_dir)

    if os.path.exists(tmp_out) and os.path.getsize(tmp_out) > 1024:
        shutil.move(tmp_out, output_path)
    else:
        raise RuntimeError('Wav2Lip produced no output or an empty file.')


def sadtalker(face_path, audio_path, output_path, sadtalker_dir=None):
    if not sadtalker_dir:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        sadtalker_dir = os.path.join(os.path.dirname(script_dir), 'SadTalker')

    inference = os.path.join(sadtalker_dir, 'inference.py')
    if not os.path.exists(inference):
        raise FileNotFoundError(f'SadTalker not found at {sadtalker_dir}. Run: ./setup.sh sadtalker')

    with tempfile.TemporaryDirectory() as tmp_dir:
        run([
            sys.executable, inference,
            '--driven_audio', audio_path,
            '--source_image', face_path,
            '--result_dir', tmp_dir,
            '--still',
            '--preprocess', 'full',
            '--enhancer', 'gfpgan',
        ], timeout=1800, cwd=sadtalker_dir)
        # Find output
        for f in os.listdir(tmp_dir):
            if f.endswith('.mp4'):
                shutil.move(os.path.join(tmp_dir, f), output_path)
                return

    raise RuntimeError('SadTalker produced no output.')


def static_ffmpeg(face_path, audio_path, output_path):
    """No lip sync — overlay audio on static face image/video. Guaranteed to work."""
    is_video = face_path.lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm'))

    # Get audio duration
    dur_result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', audio_path],
        capture_output=True, text=True, timeout=15
    )
    try:
        dur = float(json.loads(dur_result.stdout or '{}').get('format', {}).get('duration', '10'))
    except Exception:
        dur = 10.0

    if is_video:
        cmd = [
            'ffmpeg', '-y',
            '-stream_loop', '-1', '-i', face_path,
            '-i', audio_path,
            '-t', str(dur),
            '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-shortest', output_path,
        ]
    else:
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', face_path,
            '-i', audio_path,
            '-t', str(dur),
            '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-shortest', output_path,
        ]

    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode()[-400:])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--provider', default='wav2lip', choices=['wav2lip', 'sadtalker', 'static', 'auto'])
    parser.add_argument('--face', required=True)
    parser.add_argument('--audio', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--wav2lip-dir', default=None)
    parser.add_argument('--sadtalker-dir', default=None)
    args = parser.parse_args()

    for p, label in [(args.face, 'face'), (args.audio, 'audio')]:
        if not os.path.exists(p):
            print(json.dumps({'ok': False, 'error': f'{label} file not found: {p}'}))
            sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    errors = []
    provider = args.provider

    if provider in ('wav2lip', 'auto'):
        try:
            wav2lip(args.face, args.audio, args.output, wav2lip_dir=args.wav2lip_dir)
            print(json.dumps({'ok': True, 'provider': 'wav2lip', 'output': args.output}))
            return
        except Exception as e:
            errors.append(f'wav2lip: {str(e)[:200]}')
            if provider == 'wav2lip':
                print(json.dumps({'ok': False, 'error': errors[-1], 'tried': errors}))
                sys.exit(1)

    if provider == 'sadtalker':
        try:
            sadtalker(args.face, args.audio, args.output, sadtalker_dir=args.sadtalker_dir)
            print(json.dumps({'ok': True, 'provider': 'sadtalker', 'output': args.output}))
            return
        except Exception as e:
            errors.append(f'sadtalker: {str(e)[:200]}')
            print(json.dumps({'ok': False, 'error': errors[-1], 'tried': errors}))
            sys.exit(1)

    # Final fallback — static image + audio (always works)
    try:
        static_ffmpeg(args.face, args.audio, args.output)
        if os.path.exists(args.output) and os.path.getsize(args.output) > 1024:
            print(json.dumps({'ok': True, 'provider': 'static_ffmpeg', 'output': args.output, 'note': 'No lip sync model — static face used'}))
            return
    except Exception as e:
        errors.append(f'static: {str(e)[:200]}')

    print(json.dumps({'ok': False, 'error': 'All providers failed', 'tried': errors}))
    sys.exit(1)


if __name__ == '__main__':
    main()
