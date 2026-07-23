// ---------------------------------------------------------------------------
// Fuzzy name matching for duplicate detection.
//
// Goals (from the client): treat two suspect names as a possible match despite
//   - middle names ("Kaitlynn Ray" vs "Kaitlynn Gabrielle Ray")
//   - punctuation / case ("O'Brien" vs "obrien", "Smith-Jones" vs "smith jones")
//   - accents ("José" vs "Jose")
//   - minor spelling differences ("Kaitlynn" vs "Katelynn", "Smith" vs "Smyth")
//
// The incident date is factored in by the caller (duplicates require the same
// incident day), not here — this module only judges name similarity.
// ---------------------------------------------------------------------------

// Lowercase, strip accents, replace punctuation with spaces, collapse spaces.
export function normalizeName(name?: string | null): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritic marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(name?: string | null): string[] {
  const n = normalizeName(name);
  return n ? n.split(' ').filter(Boolean) : [];
}

// "First Last" ignoring any middle tokens. This is the primary, deterministic
// signal — it collapses middle names, punctuation and case with no fuzziness.
export function nameCoreKey(name?: string | null): string {
  const t = nameTokens(name);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  return `${t[0]} ${t[t.length - 1]}`;
}

// Classic Levenshtein edit distance (small strings, so the simple DP is fine).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1, // deletion
        prev[j - 1] + 1, // insertion
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

// Two single tokens are "similar" if they're equal or within a small edit
// distance scaled to their length (so short tokens must match more exactly).
export function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  const shorter = Math.min(a.length, b.length);
  if (shorter <= 2) return a === b; // too short to fuzz safely
  const threshold = Math.max(1, Math.floor(shorter / 4));
  return levenshtein(a, b) <= threshold;
}

// Are two full names a possible match? Compares first + last tokens (ignoring
// middle names) with fuzzy token equality, and also allows a first/last swap
// ("Ray Kaitlynn" vs "Kaitlynn Ray") which is a common data-entry variation.
export function namesAreSimilar(a?: string | null, b?: string | null): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  // Fast path: identical first+last core (middle names / punctuation / case).
  if (nameCoreKey(a) === nameCoreKey(b)) return true;

  const fa = ta[0];
  const la = ta[ta.length - 1];
  const fb = tb[0];
  const lb = tb[tb.length - 1];

  // Single-token names: require the lone token to fuzzy-match one end.
  if (ta.length === 1 || tb.length === 1) {
    const lone = ta.length === 1 ? fa : fb;
    const other = ta.length === 1 ? tb : ta;
    return tokenSimilar(lone, other[0]) || tokenSimilar(lone, other[other.length - 1]);
  }

  const sameOrder = tokenSimilar(fa, fb) && tokenSimilar(la, lb);
  const swapped = tokenSimilar(fa, lb) && tokenSimilar(la, fb);
  return sameOrder || swapped;
}

// Calendar-day key for an incident date (ignores any time component). Returns
// null for missing dates so the caller can decide how to treat them.
export function incidentDayKey(date?: Date | string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

// Given rows of { id, suspectName, incidentDate, notDuplicate? }, return the set
// of ids that are part of a duplicate group: same incident day AND a fuzzy name
// match with at least one other case. Cases flagged notDuplicate, or missing a
// name or date, are excluded.
export function computeDuplicateIds(
  rows: Array<{
    id: number;
    suspectName?: string | null;
    incidentDate?: Date | string | null;
    notDuplicate?: boolean | null;
  }>,
  // Safety cap: skip O(n^2) fuzzing for a single day with more rows than this
  // (falls back to exact core-key grouping for that day only).
  fuzzyBucketLimit = 400,
): Set<number> {
  const byDay = new Map<string, { id: number; name: string }[]>();
  for (const r of rows) {
    if (r.notDuplicate) continue;
    const name = (r.suspectName || '').trim();
    if (!name) continue;
    const day = incidentDayKey(r.incidentDate);
    if (!day) continue; // incident date is required (per the client's rule)
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ id: r.id, name });
  }

  const dupIds = new Set<number>();

  for (const list of byDay.values()) {
    if (list.length < 2) continue;

    // Always group by exact core key first — cheap, and catches the common
    // middle-name / punctuation / case variations.
    const byCore = new Map<string, number[]>();
    for (const item of list) {
      const key = nameCoreKey(item.name);
      if (!byCore.has(key)) byCore.set(key, []);
      byCore.get(key)!.push(item.id);
    }
    for (const ids of byCore.values()) {
      if (ids.length > 1) ids.forEach((id) => dupIds.add(id));
    }

    // Then pairwise fuzzy to catch spelling variants across core keys — only
    // when the day's bucket is small enough to keep it cheap.
    if (list.length <= fuzzyBucketLimit) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (dupIds.has(list[i].id) && dupIds.has(list[j].id)) continue;
          if (namesAreSimilar(list[i].name, list[j].name)) {
            dupIds.add(list[i].id);
            dupIds.add(list[j].id);
          }
        }
      }
    }
  }

  return dupIds;
}
