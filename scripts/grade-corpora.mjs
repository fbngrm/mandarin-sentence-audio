// node scripts/grade-corpora.mjs /path/to/aishell3 /path/to/cmn_sentences_detailed.tsv
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Converter } from 'opencc-js';
import { createDualGrader } from '../lib/grading.mjs';
const [aishell, tatoeba] = process.argv.slice(2);
if (!aishell || !tatoeba) throw new Error('Provide AISHELL-3 directory and detailed Mandarin Tatoeba TSV.');
const root = new URL('../', import.meta.url);
const hsk = JSON.parse(readFileSync(new URL('data/hsk/hsk.json', root)));
const grade = createDualGrader(hsk, Converter({ from: 'tw', to: 'cn' }));
const files = {};
const counts = {};
const distributions = {};
function save(path, data) {
    const url = new URL(path, root);
    mkdirSync(new URL('./', url), { recursive: true });
    const content = JSON.stringify(data) + '\n';
    writeFileSync(url, content);
    files[path] = { records: data.length, sha256: createHash('sha256').update(content).digest('hex') };
}
function graded(sentence) {
    const grades = grade({ text: sentence.text });
    for (const [version, result] of Object.entries(grades)) {
        const key = `${sentence.source}/${version}`;
        const histogram = distributions[key] ??= {};
        const level = result.level ?? 'unclassified';
        histogram[level] = (histogram[level] ?? 0) + 1;
    }
    return { ...sentence, grades };
}
const speakers = new Map();
const ids = new Set();
for (const split of ['train', 'test']) {
    for (const line of readFileSync(`${aishell}/${split}/content.txt`, 'utf8').trim().split(/\r?\n/)) {
        const [filename, content] = line.split('\t');
        const id = filename.replace(/\.wav$/, '');
        if (ids.has(id)) throw new Error(`Duplicate recording ${id}`);
        ids.add(id);
        const tokens = content.trim().split(/\s+/);
        const text = tokens.filter((t) => /\p{Script=Han}/u.test(t)).join('');
        const pinyin = tokens.filter((t) => !/\p{Script=Han}/u.test(t)).join(' ');
        const speaker = id.slice(0, 7);
        if (!speakers.has(speaker)) speakers.set(speaker, []);
        speakers.get(speaker).push(graded({ id, source: 'aishell3', split, speaker, text, pinyin,
            pinyinSource: 'Original AISHELL-3 annotation, numeric tones; preserved without corrections',
            audio: `audio/aishell3/${speaker}/${id}.mp3`, license: 'Apache-2.0' }));
    }
}
for (const [speaker, records] of speakers) save(`data/aishell3/${speaker}.json`, records);
counts.aishell3 = ids.size;
console.log(`Graded ${ids.size} AISHELL-3 recordings`);
const shards = new Map();
ids.clear();
for (const line of readFileSync(tatoeba, 'utf8').trim().split(/\r?\n/)) {
    const [rawId, language, text, author, added, modified] = line.split('\t');
    if (language !== 'cmn') throw new Error(`Unexpected language ${language}`);
    const id = Number(rawId);
    if (ids.has(id)) throw new Error(`Duplicate sentence ${id}`);
    ids.add(id);
    const shard = id % 256;
    if (!shards.has(shard)) shards.set(shard, []);
    shards.get(shard).push(graded({ id, source: 'tatoeba', text, by: author === '\\N' ? null : author,
        url: `https://tatoeba.org/en/sentences/show/${id}`, license: 'CC-BY-2.0-FR', added, modified }));
}
for (const [shard, records] of shards) save(`data/tatoeba/${shard}.json`, records);
counts.tatoeba = ids.size;
const inputSha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
save('manifest.json', { schemaVersion: 1, generatedAt: new Date().toISOString(), counts, distributions,
    method: { version: 1, segmentation: 'Intl.Segmenter zh', node: process.version, icu: process.versions.icu,
        normalization: 'OpenCC tw to cn', rule: 'Highest listed token level only when all Chinese tokens are listed. Otherwise null. Vocabulary estimate, not grammar or proficiency.',
        hsk: JSON.parse(readFileSync(new URL('data/hsk/meta.json', root))) },
    inputs: { aishell3Train: inputSha256(`${aishell}/train/content.txt`), aishell3Test: inputSha256(`${aishell}/test/content.txt`), tatoeba: inputSha256(tatoeba) },
    sources: { aishell3: 'https://www.openslr.org/93/', tatoeba: 'https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences_detailed.tsv.bz2' },
    files });
console.log(JSON.stringify({ counts, distributions }));
