const ACTIVE_KEYWORDS = ["REBUILD", "ADU", "REMODEL", "BUILD"] as const;
type Keyword = (typeof ACTIVE_KEYWORDS)[number];

function tokenize(text: string): Set<string> {
  const normalized = text.normalize("NFKD").toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return new Set(tokens);
}

export function matchKeyword(text: string): Keyword | null {
  const tokens = tokenize(text);
  for (const keyword of ACTIVE_KEYWORDS) {
    if (tokens.has(keyword)) {
      return keyword;
    }
  }
  return null;
}