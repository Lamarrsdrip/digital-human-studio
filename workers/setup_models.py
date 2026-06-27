#!/usr/bin/env python3
"""
setup_models.py — Download AI model files for Digital Human Studio.
Usage: python3 workers/setup_models.py [wav2lip|piper|all]
"""

import sys
import os
import urllib.request
import hashlib

MODELS = {
    'wav2lip_gan': {
        'url': 'https://iiitaphyd-my.sharepoint.com/:u:/g/personal/radrabha_m_research_iiit_ac_in/EdjI7bZlgApMqsVoEUUXpLsBxqXa5hstGB9yFOoRTRIsHg?download=1',
        'dest': 'Wav2Lip/checkpoints/wav2lip_gan.pth',
        'note': 'Wav2Lip GAN checkpoint (~440MB) — high quality lip sync',
        'size_mb': 440,
    },
    'wav2lip': {
        'url': 'https://iiitaphyd-my.sharepoint.com/:u:/g/personal/radrabha_m_research_iiit_ac_in/Eb3LEzbfuKlJiR600lQWRxgBIY27JZg80f7V9jtMfbNDaQ?download=1',
        'dest': 'Wav2Lip/checkpoints/wav2lip.pth',
        'note': 'Wav2Lip base checkpoint (~440MB)',
        'size_mb': 440,
    },
    'piper_amy': {
        'url': 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/en_US-amy-medium.tar.gz',
        'dest': 'workers/voices/en_US-amy-medium.onnx',
        'note': 'Amy voice for Piper TTS',
        'size_mb': 65,
    },
}


def download(url, dest_path, label=''):
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    if os.path.exists(dest_path):
        print(f'  ✓ Already downloaded: {label or dest_path}')
        return True
    print(f'  ↓ Downloading {label} …')
    try:
        urllib.request.urlretrieve(url, dest_path, reporthook=lambda *a: None)
        print(f'  ✓ Done: {dest_path}')
        return True
    except Exception as e:
        print(f'  ✗ Failed: {e}')
        return False


def setup_wav2lip():
    """Clone Wav2Lip and download checkpoint."""
    import subprocess
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    wav2lip_dir = os.path.join(root, 'Wav2Lip')
    if not os.path.exists(os.path.join(wav2lip_dir, 'inference.py')):
        print('Cloning Wav2Lip …')
        subprocess.run(['git', 'clone', 'https://github.com/Rudrabha/Wav2Lip.git', wav2lip_dir], check=True)
        # Install dependencies
        print('Installing Wav2Lip Python deps …')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', os.path.join(wav2lip_dir, 'requirements.txt')], check=False)
    else:
        print('Wav2Lip repo already cloned.')

    ckpt_dir = os.path.join(wav2lip_dir, 'checkpoints')
    os.makedirs(ckpt_dir, exist_ok=True)
    if not os.path.exists(os.path.join(ckpt_dir, 'wav2lip_gan.pth')):
        print('\n⚠️  Wav2Lip checkpoint requires manual download due to SharePoint restrictions.')
        print('  1. Open: https://github.com/Rudrabha/Wav2Lip#getting-the-weights')
        print(f'  2. Download wav2lip_gan.pth')
        print(f'  3. Place it at: {os.path.join(ckpt_dir, "wav2lip_gan.pth")}')
    else:
        print('Wav2Lip checkpoint found.')


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else 'all'
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    if target in ('wav2lip', 'all'):
        print('\n=== Wav2Lip setup ===')
        setup_wav2lip()

    if target in ('piper', 'all'):
        print('\n=== Piper TTS setup ===')
        print('  Install piper: pip install piper-phonemize')
        print('  Or download the binary from: https://github.com/rhasspy/piper/releases')
        voices_dir = os.path.join(root, 'workers', 'voices')
        os.makedirs(voices_dir, exist_ok=True)
        print(f'  Voice files go in: {voices_dir}')
        print('  Download voices from: https://huggingface.co/rhasspy/piper-voices')

    print('\n=== Setup complete ===')
    print('Run: node server.js')
    print('Open: http://localhost:4200')


if __name__ == '__main__':
    main()
