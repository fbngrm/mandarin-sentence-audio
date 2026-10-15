# Mandarin sentence audio and vocabulary grades

88,035 AISHELL-3 native Mandarin recordings with Chinese transcripts, original
numeric-tone pinyin, and HSK vocabulary grades; 89,179 Mandarin Tatoeba sentence
texts with grades and contributor attribution.

See [NOTICE.md](NOTICE.md) for credits, modifications, and separate data licenses.
AISHELL-3 is Apache-2.0; Tatoeba text is CC BY 2.0 FR. No Tatoeba audio is included.

## Fetch a recording and its metadata

Use the pinned `v1.0.0` release for consistent data:

```js
const base = 'https://raw.githubusercontent.com/fbngrm/mandarin-sentence-audio/v1.0.0/';
const id = 'SSB00050001';
const records = await (await fetch(`${base}data/aishell3/${id.slice(0, 7)}.json`)).json();
const sentence = records.find((row) => row.id === id);
console.log(sentence.text, sentence.pinyin, sentence.grades);
const audio = new Audio(new URL(sentence.audio, base).href);
// Call audio.play() from a user interaction.
```

Tatoeba records are in `data/tatoeba/<numeric sentence ID % 256>.json`.
AISHELL-3 records are grouped by speaker. Each shard is a JSON array; the
manifest lists every shard, record count, SHA-256, source-input hashes,
grading runtime, and grade distributions. All train and test transcripts are
included. Audio files are under `audio/aishell3/<speaker>/<recording ID>.mp3`.

## How grading works

1. Convert traditional Chinese to simplified with OpenCC for vocabulary lookup.
2. Split into words with `Intl.Segmenter('zh')`; keep tokens containing Han characters.
3. Look up each token independently in HSK 2.0 and HSK 3.0 (2025).
4. If every token is listed, assign the highest token level. Otherwise `level` is
   null and report `highestKnownLevel`, `coverage`, and `unlisted` words.

Level 7 means the combined 7–9 band. Coverage is the fraction of token occurrences
listed, not the fraction of unique words. Empty/non-Chinese input has no grade.
The full token breakdown is retained for inspection. Splitting may vary between
ICU versions; the generating runtime is recorded in `manifest.json`.

This is a vocabulary estimate. It does not assess grammar, idioms, reading
comprehension, speech rate, accent, or listening difficulty. Names and compounds
may remain unlisted. The MIT source has 10,057 spellings with 2025 labels and is
incomplete; missing entries must not be treated as officially outside HSK.
The separate `hsk3` field in the vocabulary data preserves the **2021** standard.
It is not silently relabeled as the 2025 syllabus.

## Reproduce locally

Requires Node.js with ICU, Python 3, and LAME. Obtain the original AISHELL-3
corpus from OpenSLR and the detailed Mandarin TSV export from Tatoeba.

```sh
npm install
python3 scripts/prepare-audio.py /path/to/aishell3
node scripts/grade-corpora.mjs /path/to/aishell3 /path/to/cmn_sentences_detailed.tsv
python3 scripts/validate.py
```

The audio conversion can reuse existing matching MP3s with `--reuse <directory>`.
Original source files are never modified. JSON and MP3s can be self-hosted using
the same relative paths. The dictionary library exports URL helpers for this corpus.
