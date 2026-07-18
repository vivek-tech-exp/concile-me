export type NormalizedText = {
  original: string;
  normalized: string;
  changed: boolean;
};

export function normalizeIdentifier(original: string): NormalizedText {
  const normalized = original.trim().toUpperCase();
  return {
    original,
    normalized,
    changed: original !== normalized,
  };
}

export function normalizeCurrency(original: string): NormalizedText {
  const normalized = original.trim().toUpperCase();
  return {
    original,
    normalized,
    changed: original !== normalized,
  };
}

export function normalizeEnumToken(original: string): NormalizedText {
  const normalized = original.trim().toLowerCase();
  return {
    original,
    normalized,
    changed: original !== normalized,
  };
}
