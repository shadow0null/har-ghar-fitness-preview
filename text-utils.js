/** Pure text helpers for Har Ghar Fitness (deep-fix copy).
 * No DOM, no network — unit-testable in Node.
 *
 * The imported source text in public/media/manifest.json contains literal
 * escape sequences (backslash-n for line breaks, backslash-quote for
 * apostrophes) because the extraction wrote them double-escaped. The app
 * must unescape them at display time; the manifest itself is left untouched
 * so its checksums/provenance stay intact.
 */
export function unescapeSourceText(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** Verified typo corrections only. Each entry replaces one exact source
 * string; nothing is invented and no wording is rephrased. */
export function applyTextFixes(text, fixes) {
  let out = typeof text === 'string' ? text : text;
  for (const f of fixes?.typos || []) {
    if (typeof out === 'string' && out.includes(f.find)) out = out.replaceAll(f.find, f.replace);
  }
  return out;
}

export function textFlagsFor(id, fixes) {
  return (fixes?.flags || []).filter((f) => String(f.id) === String(id)).map((f) => f.note);
}

/** Display label for a source catalog/module nameKey.
 * Source keys that are crude, sexualised or body-shaming are neutralised to
 * "General Fitness" (the same treatment the original code already applied
 * to man_boobs / v_lines / belly-fat keys). Nothing else is renamed. */
const NEUTRALISED = /belly_fat_burner|fat_burning|fat_burn|lose_fat|calorie_burner|man_boobs|v_lines|three_exercises_to_lose_belly_fat|last_longer_in_bed/gi;
export function labelFor(key) {
  return String(key || 'Catalog entry')
    .replace(NEUTRALISED, 'general_fitness')
    .replace(/_name$/, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Equipment words mentioned in the source *instructions* (the introduce
 * text), i.e. setup the movement itself needs — bench, chair, wall, doorway.
 * Dumbbell mentions live almost entirely in tips as an optional
 * "if too easy" progression, so they are reported separately and never
 * presented as a requirement. Returns {setup: [], optional: []}. */
const SETUP_WORDS = ['bench', 'chair', 'wall', 'doorway'];
export function equipmentHints(introduce, tips) {
  const intro = String(introduce || '').toLowerCase();
  const tipText = (tips || []).map((t) => (typeof t === 'string' ? t : t.text || '')).join(' ').toLowerCase();
  const setup = SETUP_WORDS.filter((w) => intro.includes(w));
  const optional = [];
  if (/\bdumbbell\b/.test(tipText) && !/\bdumbbell\b/.test(intro)) optional.push('dumbbell (optional progression only)');
  if (/\bdumbbell\b/.test(intro)) setup.push('dumbbell');
  return { setup, optional };
}

/** Animation status line for a program step row. Uses only the joined media
 * record — an exercise with no licensed Lottie file is preview-only. */
export function animationStatus(e) {
  return e?.media?.format === 'lottie' ? 'licensed animation' : 'no animation · preview-only';
}

/** True when the source has no name, animation or guidance for this
 * exercise at all (one of the 34 missing IDs). Nothing is invented for it. */
export function isMissingExercise(e) {
  return !e?.media && !e?.guidance;
}

/** Rest shown after a step. Source steps carry restSeconds 10 or 25, or
 * null (meaning the app default of 25s). Returns the effective seconds. */
export function restAfter(step, defaultRest = 25) {
  const r = step?.restSeconds;
  return Number.isFinite(+r) && +r > 0 ? +r : defaultRest;
}

/** Evenly spread `count` days across a 7-day week (Mon=0). The previous
 * code used Math.floor(i*7/count), which gives the familiar Mon/Wed/Fri for 3 days. */
export function weeklyDays(count) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = names[Math.min(6, Math.floor((i * 7) / count))];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
