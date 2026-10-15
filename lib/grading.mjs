const HAN = /\p{Script=Han}/u;
export const levelLabel = (level) => level === 7 ? '7–9' : String(level);

// Accept plain text, AISHELL-1 IDs + transcripts, or AISHELL-3 content.txt.
export function parseSentences(input) {
    return input.split(/\r?\n/).flatMap((line) => {
        line = line.trim();
        if (!line) return [];
        const aishell3 = line.match(/^(SSB\d+)(?:\.wav)?\t(.+)$/);
        if (aishell3) return [{ id: aishell3[1], text: aishell3[2].split(/\s+/).filter((word) => HAN.test(word)).join('') }];
        const aishell1 = line.match(/^(BAC\d+S\d+W\d+)\s+(.+)$/);
        if (aishell1) return [{ id: aishell1[1], text: aishell1[2].replace(/\s+/g, '') }];
        return (line.match(/[^。！？!?]+[。！？!?]*/g) ?? []).map((text) => ({ text: text.trim() })).filter((s) => s.text);
    });
}

export function createGrader(hsk, simplify = (text) => text, version = 'hsk3_2025') {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    return (sentence) => {
        const normalized = simplify(sentence.text);
        const tokens = [...segmenter.segment(normalized)].filter((s) => HAN.test(s.segment)).map(({ segment }) => ({
            word: segment,
            level: hsk[segment]?.[version] ?? null,
        }));
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, unlisted: 0 };
        for (const token of tokens) counts[token.level ?? 'unlisted']++;
        const known = tokens.filter((t) => t.level !== null);
        const highestKnownLevel = known.length ? Math.max(...known.map((t) => t.level)) : null;
        return {
            ...sentence, normalized, tokens, counts,
            // Unlisted words prevent a complete vocabulary classification.
            level: tokens.length && !counts.unlisted ? highestKnownLevel : null,
            highestKnownLevel,
            coverage: tokens.length ? known.length / tokens.length : 0,
            unlisted: [...new Set(tokens.filter((t) => t.level === null).map((t) => t.word))],
        };
    };
}

export function createDualGrader(hsk, simplify = (text) => text) {
    const modern = createGrader(hsk, simplify, 'hsk3_2025');
    const legacy = createGrader(hsk, simplify, 'hsk2');
    return (sentence) => ({ hsk3_2025: modern(sentence), hsk2: legacy(sentence) });
}
export function compactGrade(grade) {
    const { level, highestKnownLevel, coverage, unlisted } = grade;
    return { level, highestKnownLevel, coverage, unlisted };
}
