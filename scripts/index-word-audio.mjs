// Find complete AISHELL recordings whose transcript and pronunciation match a dictionary word.
// node scripts/index-word-audio.mjs /path/to/zh-dictionary
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const dictionary = resolve(process.argv[2] ?? '');
const { splitPinyin } = await import(pathToFileURL(`${dictionary}/dist/index.js`));
const read = (path) => JSON.parse(readFileSync(path));
const hanzi = read(`${dictionary}/data/hanzi/hanzi.json`);
const sources = ['zh/dictionary', 'cedict/cedict'].map((file) => read(`${dictionary}/data/${file}.json`));
const root = new URL('../', import.meta.url);
const marks = { '\u0304': 1, '\u0301': 2, '\u030c': 3, '\u0300': 4 };
function key(syllable) {
    const normalized = syllable.toLowerCase().replace(/u:|v/g, 'ü').normalize('NFD');
    const accent = [...normalized].find((c) => marks[c]);
    const digit = normalized.match(/[0-5]$/)?.[0];
    const tone = accent ? marks[accent] : digit ? Number(digit) % 5 : 0;
    return normalized.replace(/[\u0304\u0301\u030c\u0300]/g, '').replace(/[0-5]$/, '').normalize('NFC') + tone;
}
const words = {};
let exactTranscripts = 0;
let matchingReadings = 0;
for (const file of readdirSync(new URL('data/aishell3/', root))) {
    for (const sentence of read(new URL(`data/aishell3/${file}`, root))) {
        const entries = sources.flatMap((data) => Object.hasOwn(data, sentence.text) ? [data[sentence.text]].flat() : []);
        if (!entries.length) continue;
        exactTranscripts++;
        const recorded = sentence.pinyin.split(/\s+/).map(key).join(' ');
        const readings = [...new Set(entries.filter((entry) => {
            const syllables = splitPinyin(entry.pinyin, [...sentence.text], (c) => hanzi[c]?.pinyin ?? []);
            return syllables && syllables.map(key).join(' ') === recorded;
        }).map((entry) => entry.pinyin))];
        if (!readings.length) continue;
        matchingReadings++;
        (words[sentence.text] ??= []).push({ id: sentence.id, pinyin: sentence.pinyin, readings,
            audio: sentence.audio, bytes: statSync(new URL(sentence.audio, root)).size });
    }
}
for (const rows of Object.values(words)) rows.sort((a, b) => a.bytes - b.bytes || a.id.localeCompare(b.id));
writeFileSync(new URL('data/word-audio.json', root), JSON.stringify({
    source: 'AISHELL-3', license: 'Apache-2.0',
    method: 'Complete recording transcript equals dictionary word; syllables and tones match a dictionary reading. No extraction, synthesis, or tone-sandhi guessing.',
    counts: { exactTranscripts, matchingReadings, words: Object.keys(words).length }, words,
}) + '\n');
console.log(JSON.stringify({ exactTranscripts, matchingReadings, words: Object.keys(words).length }));
const manifest = read(new URL('manifest.json', root));
manifest.wordAudio = {
    path: 'data/word-audio.json',
    sha256: createHash('sha256').update(readFileSync(new URL('data/word-audio.json', root))).digest('hex'),
    words: Object.keys(words).length, recordings: matchingReadings,
};
writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest) + '\n');
