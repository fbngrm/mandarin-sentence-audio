#!/usr/bin/env python3
"""Convert every AISHELL-3 transcript recording, preserving original IDs.
python3 scripts/prepare-audio.py /path/to/aishell3 --reuse /path/to/existing/mp3s
Requires LAME; original WAV files are never modified.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('corpus', type=Path)
p.add_argument('--reuse', type=Path)
p.add_argument('--workers', type=int, default=8)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
sources = {}
for split in ('train', 'test'):
    for line in (a.corpus / split / 'content.txt').read_text().splitlines():
        name, content = line.split('\t', 1)
        clip = Path(name).stem
        source = a.corpus / split / 'wav' / clip[:7] / name
        if clip in sources or not source.is_file():
            raise ValueError(f'Duplicate or missing recording: {clip}')
        sources[clip] = source

def convert(item):
    clip, source = item
    relative = Path(clip[:7]) / f'{clip}.mp3'
    target = root / 'audio/aishell3' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size:
        return
    if a.reuse and (a.reuse / relative).is_file():
        os.link(a.reuse / relative, target)
        return
    temporary = target.with_suffix('.tmp.mp3')
    subprocess.run(['lame', '--silent', '-m', 'm', '--resample', '24', '-b', '48',
                    '--ta', 'Beijing Shell Shell Technology Co., Ltd.',
                    '--tt', f'AISHELL-3 {clip}',
                    '--tc', 'Apache-2.0; https://www.openslr.org/93/; converted from WAV to mono 24 kHz 48 kbps MP3; speech unchanged.',
                    str(source), str(temporary)], check=True, capture_output=True)
    temporary.replace(target)

with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
    for n, _ in enumerate(pool.map(convert, sorted(sources.items())), 1):
        if n % 5000 == 0:
            print(f'{n}/{len(sources)} recordings ready', flush=True)
(root / 'audio/aishell3/index.json').write_text(json.dumps({'source': 'https://www.openslr.org/93/', 'license': 'Apache-2.0', 'clips': sorted(sources)}, separators=(',', ':')) + '\n')
print(f'Complete: {len(sources)} recordings', flush=True)
