// Normalize presentation only. Preserve numbers, operators, word boundaries and negation.
export function normalizeCourseQuote(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\uFF01-\uFF5E]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/。/g, '.')
    .replace(/、/g, ',')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([^A-Za-z0-9]) | ([^A-Za-z0-9])/g, '$1$2')
    .trim();
}
export function reconcileCourseQuotes(quotes: string[], source: string) {
  const normalized = normalizeCourseQuote(source);
  const matched: string[] = [],
    unmatched: string[] = [];
  for (const quote of new Set(quotes)) {
    const key = normalizeCourseQuote(quote);
    (key && normalized.includes(key) ? matched : unmatched).push(quote);
  }
  return { matched, unmatched };
}
