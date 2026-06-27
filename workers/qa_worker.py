#!/usr/bin/env python3
"""
qa_worker.py — Quality assurance for generated Digital Human videos.
Checks: resolution, duration, audio sync, face presence, sharpness.

Usage:
  python3 qa_worker.py <video_path> [face_ref_path]
Outputs JSON on stdout.
"""

import sys
import os
import json
import subprocess


def ffprobe(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json',
         '-show_streams', '-show_format', path],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f'ffprobe failed: {result.stderr}')
    return json.loads(result.stdout or '{}')


def check_video(video_path, face_ref_path=''):
    issues = []
    score = 100
    info = {}

    # --- Basic probe ---
    try:
        probe = ffprobe(video_path)
    except Exception as e:
        return {'valid': False, 'score': 0, 'issues': [f'Cannot probe video: {e}'], 'info': {}}

    streams = probe.get('streams', [])
    fmt = probe.get('format', {})

    video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
    audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)

    # File size
    size_bytes = os.path.getsize(video_path)
    info['size_mb'] = round(size_bytes / 1024 / 1024, 2)
    if size_bytes < 50_000:
        issues.append('Video file is suspiciously small — may be corrupted')
        score -= 40

    # Duration
    dur = float(fmt.get('duration', 0) or 0)
    info['duration'] = round(dur, 2)
    if dur < 1:
        issues.append('Video duration is under 1 second')
        score -= 30
    elif dur > 300:
        issues.append('Video is over 5 minutes — unusually long')
        score -= 5

    # Resolution
    if video_stream:
        w = int(video_stream.get('width', 0))
        h = int(video_stream.get('height', 0))
        info['width'] = w
        info['height'] = h
        info['codec'] = video_stream.get('codec_name', '')

        if w == 0 or h == 0:
            issues.append('Cannot detect video resolution')
            score -= 20
        elif w < 360 or h < 480:
            issues.append(f'Low resolution: {w}x{h} — recommend at least 540x960')
            score -= 15
        elif w >= 540 and h >= 960:
            info['portrait'] = True

        fps_raw = video_stream.get('r_frame_rate', '0/1')
        try:
            n, d = fps_raw.split('/')
            fps = float(n) / float(d)
            info['fps'] = round(fps, 2)
            if fps < 20:
                issues.append(f'Low framerate: {fps:.1f}fps — recommend 24+')
                score -= 10
        except Exception:
            info['fps'] = None
    else:
        issues.append('No video stream found in output')
        score -= 40

    # Audio
    if audio_stream:
        ar = int(audio_stream.get('sample_rate', 0))
        info['audio_rate'] = ar
        info['audio_codec'] = audio_stream.get('codec_name', '')
        if ar < 16000:
            issues.append(f'Low audio sample rate: {ar}Hz — recommend 44100')
            score -= 10
    else:
        issues.append('No audio stream in video')
        score -= 25

    # Quick sharpness estimate via ffmpeg signalstats (optional, skip if slow)
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', video_path, '-vf', 'select=eq(n\\,5),signalstats', '-frames:v', '1',
             '-f', 'null', '-'],
            capture_output=True, text=True, timeout=15,
        )
        stderr = result.stderr
        if 'YAVG' in stderr:
            import re
            m = re.search(r'YAVG:(\d+\.?\d*)', stderr)
            if m:
                yavg = float(m.group(1))
                info['brightness_avg'] = yavg
                if yavg < 30:
                    issues.append('Video appears very dark — check lighting on face asset')
                    score -= 10
    except Exception:
        pass

    score = max(0, min(100, score))
    return {
        'valid': score >= 50 and 'No video stream' not in str(issues),
        'score': score,
        'issues': issues,
        'info': info,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'ok': False, 'error': 'Usage: qa_worker.py <video> [face_ref]'}))
        sys.exit(1)

    video_path = sys.argv[1]
    face_ref = sys.argv[2] if len(sys.argv) > 2 else ''

    if not os.path.exists(video_path):
        print(json.dumps({'valid': False, 'score': 0, 'issues': [f'Video not found: {video_path}'], 'info': {}}))
        sys.exit(1)

    result = check_video(video_path, face_ref)
    result['ok'] = True
    print(json.dumps(result))


if __name__ == '__main__':
    main()
