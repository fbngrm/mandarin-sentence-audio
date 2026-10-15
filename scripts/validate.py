#!/usr/bin/env python3
"""Validate every JSON shard, grade, ID and referenced MP3; write audio hashes."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text())
seen = {'aishell3': set(), 'tatoeba': set()}
audio = {}
recordings = {}
for name, info in manifest['files'].items():
    content = (root / name).read_bytes()
    assert hashlib.sha256(content).hexdigest() == info['sha256'], name
    records = json.loads(content)
    assert len(records) == info['records'], name
    for row in records:
        assert row['id'] not in seen[row['source']], row['id']
        seen[row['source']].add(row['id'])
        assert row['text']
        for grade in row['grades'].values():
            listed = [token['level'] for token in grade['tokens'] if token['level'] is not None]
            expected = max(listed) if listed and len(listed) == len(grade['tokens']) else None
            assert grade['level'] == expected, row['id']
            assert 0 <= grade['coverage'] <= 1
        if row['source'] == 'aishell3':
            recordings[row['id']] = row
            assert row['pinyin']
            assert row['audio'] == f"audio/aishell3/{row['speaker']}/{row['id']}.mp3"
            data = (root / row['audio']).read_bytes()
            assert len(data) > 500 and (data.startswith(b'ID3') or data[0] == 255), row['id']
            audio[row['id']] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        else:
            assert row['license'] == 'CC-BY-2.0-FR' and row['url'].endswith(str(row['id']))
for source, ids in seen.items():
    assert len(ids) == manifest['counts'][source], source
assert {p.stem for p in (root / 'audio/aishell3').glob('*/*.mp3')} == seen['aishell3']
assert set(json.loads((root / 'audio/aishell3/index.json').read_text())['clips']) == seen['aishell3']
(root / 'audio/checksums.json').write_text(json.dumps(audio, separators=(',', ':')) + '\n')
print(json.dumps({'records': manifest['counts'], 'audioBytes': sum(x['bytes'] for x in audio.values()), 'validated': True}))

word_path = root / manifest['wordAudio']['path']
assert hashlib.sha256(word_path.read_bytes()).hexdigest() == manifest['wordAudio']['sha256']
index = json.loads(word_path.read_text())
assert len(index['words']) == manifest['wordAudio']['words']
for word, rows in index['words'].items():
    for row in rows:
        source = recordings[row['id']]
        assert source['text'] == word and source['pinyin'] == row['pinyin']
        assert source['audio'] == row['audio'] and row['readings']
print('Word recording transcripts, pronunciations and index checksum validated.')
