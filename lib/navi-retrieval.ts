/** Deterministic, bounded lexical retrieval. No embedding service or private index upload. */
export function retrievalTerms(query: string) {
  const clean = query.normalize('NFKC').toLowerCase();
  const words =
    clean.match(
      /[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
    ) ?? [];
  return [
    ...new Set(
      words.flatMap((w) =>
        /[a-z0-9]/.test(w)
          ? w.length > 2
            ? [w]
            : []
          : [
              w,
              ...Array.from({ length: Math.max(0, w.length - 1) }, (_, i) =>
                w.slice(i, i + 2),
              ),
            ],
      ),
    ),
  ].slice(0, 100);
}
export function retrievalScore(text: string, terms: string[]) {
  const value = text.normalize('NFKC').toLowerCase();
  return terms.reduce(
    (score, term) =>
      score + (value.includes(term) ? Math.min(12, term.length) : 0),
    0,
  );
}
export function selectRelated<T>(
  items: T[],
  query: string,
  text: (item: T) => string,
  max: number,
  group?: (item: T) => string,
) {
  const terms = retrievalTerms(query),
    ranked = items
      .map((item, index) => ({
        item,
        index,
        score: retrievalScore(text(item), terms),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index),
    matched = ranked.filter((x) => x.score > 0);
  // No lexical match means a representative sample, never a claim to have read everything.
  const diverse = group
    ? matched.filter(
        (entry, index) =>
          matched.findIndex(
            (other) => group(other.item) === group(entry.item),
          ) === index,
      )
    : matched;
  const selected = matched.length
    ? [
        ...diverse.slice(0, max),
        ...matched.filter((x) => !diverse.slice(0, max).includes(x)),
      ].slice(0, max)
    : Array.from({ length: Math.min(max, items.length) }, (_, i) => ({
        item: items[
          Math.floor((i * items.length) / Math.min(max, items.length))
        ],
        index: i,
        score: 0,
      }));
  return {
    items: selected.map((x) => x.item),
    matched: matched.length,
    method: matched.length ? 'ranked' : 'overview-sample',
  };
}
export function retrieveMaterial(value: string, query: string) {
  const segments: { text: string; start: number; end: number }[] = [];
  for (const match of value.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)) {
    const start = match.index;
    for (let offset = 0; offset < match[0].length; offset += 1300) {
      const text = match[0].slice(offset, offset + 1300);
      segments.push({
        text,
        start: start + offset,
        end: start + offset + text.length,
      });
    }
  }
  return {
    ...selectRelated(segments, query, (s) => s.text, 5),
    totalSegments: segments.length,
  };
}
