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

export function labelTip(text) {
  if (typeof text !== 'string') return text;
  const easy = /too easy/i.test(text), hard = /too hard/i.test(text);
  if (hard && !easy) return 'Easier: ' + text;
  if (easy && !hard) return 'Harder: ' + text;
  return text;
}

/** Display name for an exercise. The source record for a missing exercise
 * is literally named "Exercise 364 — name unverified", so the list must not
 * append "· name unverified" again (audit #17). */
export function displayName(e) {
  return String(e?.name || '').replace(/\s+—\s+name unverified$/, '') || `Exercise ${e?.id ?? ''}`;
}

/** One consistent difficulty scale for every program (audit #4/#5).
 * Focus programs and 28-Day Full Body use their level; Upper Body uses its
 * number; 28-day Series / Lower Body have no level in the source, so they
 * use Day-1 size: ≤15 steps Beginner, 16–25 Intermediate, 26+ Advanced.
 * Chest Beginner Variants 2/3 are Beginner (1 bolt), not 2/3. */
export function difficultyBolts(p) {
  const id = String(p?.id || '');
  const m = id.match(/^d_(ab|ar|ch|le|sh)_([123])$/);
  if (m) return { bolts: +m[2], level: ['', 'Beginner', 'Intermediate', 'Advanced'][+m[2]] };
  if (id.startsWith('d_ch_1_')) return { bolts: 1, level: 'Beginner' };
  const whole = id.match(/^7__4_(beginner|intermediate|advance)$/);
  if (whole) {
    const level = { beginner: 'Beginner', intermediate: 'Intermediate', advance: 'Advanced' }[whole[1]];
    return { bolts: { Beginner: 1, Intermediate: 2, Advanced: 3 }[level], level };
  }
  const upper = id.match(/^upper_([123])$/);
  if (upper) return { bolts: +upper[1], level: ['', 'Beginner', 'Intermediate', 'Advanced'][+upper[1]] };
  const steps = p?.days?.[0]?.steps?.length || 0;
  const level = steps <= 15 ? 'Beginner' : steps <= 25 ? 'Intermediate' : 'Advanced';
  return { bolts: level === 'Beginner' ? 1 : level === 'Intermediate' ? 2 : 3, level };
}

export function levelClassName(level) {
  return { Beginner: 'lvl-beginner', Intermediate: 'lvl-intermediate', Advanced: 'lvl-advanced' }[level] || 'lvl-beginner';
}

/** Collapse runs of literally identical consecutive steps
 * (same exercise, mode and value) into one row: {firstIndex, count, step}.
 * The player still runs the full ungrouped list — this is display only. */
export function groupConsecutiveSteps(steps) {
  const out = [];
  for (let i = 0; i < (steps || []).length; i++) {
    const s = steps[i], last = out[out.length - 1];
    if (last && last.step.exerciseId === s.exerciseId && last.step.mode === s.mode && last.step.value === s.value) last.count++;
    else out.push({ firstIndex: i, count: 1, step: s });
  }
  return out;
}

/** Steps whose exercise belongs to a different focus area than the program
 * (audit #37). Name-based and deliberately conservative: only leg moves in a
 * non-Legs program and push-ups in an Abs/Legs program are flagged — push-ups
 * are standard in Arms programs and Leg Raises are an abs move, so neither
 * is flagged. Returns [{name, count, focus}]. */
const LEG_WORDS = /\b(leg|legs|calf|calves|squat|squats|lunge|lunges|thigh|thighs)\b/i;
export function focusMismatchSteps(steps, focusCode, exercises) {
  if (!focusCode || !['ab', 'ar', 'ch', 'le', 'sh'].includes(focusCode)) return [];
  const out = [];
  for (const s of steps || []) {
    const name = String(exercises?.[s.exerciseId]?.name || '');
    let focus = null;
    if (LEG_WORDS.test(name) && !/leg raises?/i.test(name) && focusCode !== 'le') focus = 'Legs';
    else if (/push[ -]?ups?/i.test(name) && (focusCode === 'ab' || focusCode === 'le')) focus = 'Chest';
    if (!focus) continue;
    const last = out[out.length - 1];
    if (last && last.name === name && last.focus === focus) last.count++;
    else out.push({ name, count: 1, focus });
  }
  return out;
}

/** A Discover cover must be a real landscape photo. Square icon art
 * (420×420 module icons, 92px workout icons) is not a cover photo:
 * stretching one across a card crops it into a tiny icon at the top edge
 * (audit #26, Plank Challenge). */
export function isCoverPhoto(asset) {
  return !!asset?.url && (+asset.width || 0) > 200 && (+asset.width || 0) > (+asset.height || 0) * 1.2;
}

/** Deep-link parsing for the landing page (app/?tab=…&program=…&exercise=…).
 * Pure and unit-testable; the app applies it once after data loads. */
const VALID_TABS = ['training', 'discover', 'meal', 'report', 'settings', 'plans'];
export function parseDeepLink(search) {
  try {
    const q = new URLSearchParams(search || '');
    const tab = q.get('tab'), program = q.get('program'), exercise = q.get('exercise');
    return {
      tab: VALID_TABS.includes(tab) ? tab : null,
      program: program || null,
      exercise: exercise || null,
    };
  } catch { return { tab: null, program: null, exercise: null }; }
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

/** Honest minute estimate for a routine's steps. Timed steps contribute
 * their seconds; each repetition is allowed REP_SECONDS seconds. The
 * screens that show these minutes always say how they are calculated —
 * they are estimates, never source data. */
export const REP_SECONDS = 3;
export function estimateSeconds(steps) {
  let timed = 0, reps = 0;
  for (const s of steps || []) {
    if (s?.mode === 'timed') timed += Number(s.value) || 0;
    else if (s?.mode === 'reps') reps += Number(s.value) || 0;
  }
  return { timedSecs: timed, repSecs: reps * REP_SECONDS, totalSecs: timed + reps * REP_SECONDS };
}
export function estimateMinutes(steps) {
  return estimateSeconds(steps).totalSecs / 60;
}
export function estimateMinutesLabel(steps) {
  return `≈ ${Math.max(1, Math.round(estimateMinutes(steps)))} min`;
}

/** Honest, data-derived tags for a program's Day 1 steps, used by the
 * Challenge list filters and the Training quick filters. Every tag is
 * computed from the steps themselves — muscle groups from the source
 * muscle IDs, cardio from step names, equipment from the source
 * instructions — and the screens explain the basis. Nothing here claims
 * a medical outcome: "Lose Weight" means only that the routine is
 * cardio-leaning (it contains a cardio-named move and timed movement is
 * at least a quarter of the estimated time), "Build Muscle" means only
 * that most of the estimated time comes from repetitions, and "Stretch"
 * means only that at least a fifth of the steps are stretch moves. */
const CARDIO_WORDS = /jump|jog|run|burpee|jack|climber|mountain/i;
const UPPER_GROUPS = new Set(['Chest', 'Shoulders', 'Triceps', 'Biceps', 'Back']);
const LOWER_GROUPS = new Set(['Legs', 'Legs & Glutes', 'Glutes & Hips', 'Calves', 'Inner Thighs & Hips']);
export function dayTags(program, exercises) {
  const steps = program?.days?.[0]?.steps || [];
  const { timedSecs, repSecs, totalSecs } = estimateSeconds(steps);
  const groups = new Set();
  let upper = 0, lower = 0, core = 0, cardio = false, stretchSteps = 0, equipment = false;
  for (const s of steps) {
    const e = exercises?.[s.exerciseId];
    if (!e) continue;
    const name = String(e.name || '');
    if (CARDIO_WORDS.test(name)) cardio = true;
    if (/stretch/i.test(name)) stretchSteps++;
    if (equipmentHints(e.guidance, e.tips).setup.length) equipment = true;
    for (const g of muscleGroupsFor(e, null).groups) {
      groups.add(g);
      if (UPPER_GROUPS.has(g)) upper++;
      else if (LOWER_GROUPS.has(g)) lower++;
      else if (g === 'Abs & Core') core++;
    }
  }
  const estMin = totalSecs / 60;
  return {
    muscle: repSecs > timedSecs,
    weight: totalSecs > 0 && timedSecs >= totalSecs / 4 && cardio,
    fullbody: String(program?.id || '').startsWith('7__4_') || groups.size >= 3,
    upper: upper > 0 && upper > lower && upper > core,
    lower: lower > 0 && lower > upper && lower > core,
    abs: core >= 2,
    stretch: steps.length > 0 && stretchSteps / steps.length >= 0.2,
    equipment,
    beginner: difficultyBolts(program).level === 'Beginner',
    short: estMin < 10,
    long: estMin >= 20,
    estMin, timedSecs, repSecs, groups: [...groups],
  };
}

/** Display label for a source catalog/module nameKey.
 * Only the three keys that are crude or sexualised are neutralised to
 * "General Fitness": man_boobs, v_lines, last_longer_in_bed. Ordinary
 * fitness titles (belly fat burner, fat burning, lose fat, calorie burner)
 * are kept as written — the old over-broad rule collapsed four different
 * workouts into identical "General Fitness" cards (seen on qadir's phone
 * video, 2026-10-28). Nothing else is renamed. */
const NEUTRALISED = /man_boobs|v_lines|last_longer_in_bed/gi;
export function labelFor(key) {
  const raw = String(key || 'Catalog entry');
  if (raw.toLowerCase() === 'butt_leg') return 'Glutes & Legs';
  return raw
    .replace(NEUTRALISED, 'general_fitness')
    .replace(/_name$/, '')
    .replaceAll('_', ' ')
    // Source fragments, not titles: "Stretch Neck Title" / "Back Stretching 7".
    .replace(/\s+title$/i, '')
    .replace(/\s+\d+$/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Real workout count for a Body Focus collection tile: the number of
 * catalog entries listed in that collection in reference.json. Returns
 * null when the collection has no entry list, so the tile shows no count
 * rather than an invented one. */
export function focusTileCount(collection) {
  return Array.isArray(collection?.workoutIds) ? collection.workoutIds.length : null;
}

/** Card title for a Discover entry. A neutralised ("General Fitness") entry
 * is disambiguated with its real level, so the three v_lines / man_boobs
 * cards (Beginner / Intermediate / Advanced) no longer look identical. */
export function discoverDisplayTitle(record) {
  const label = labelFor(record?.nameKey);
  if (label === 'General Fitness' && record?.level) {
    return `General Fitness · ${String(record.level).replace(/^\w/, (c) => c.toUpperCase())}`;
  }
  return label;
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

/** Map of exercise names that occur more than once (by source ID), e.g.
 * Mountain Climber 12/451. Step rows use this to show the source ID for
 * duplicates only, so two exercises with the same name can be told apart. */
export function findDuplicateNames(exercises) {
  const byName = new Map();
  for (const e of Object.values(exercises || {})) {
    if (!e?.name) continue;
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(String(e.id));
  }
  const out = new Map();
  for (const [name, ids] of byName) if (ids.length > 1) out.set(name, ids);
  return out;
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

/** Standard muscle groups for the source numeric muscle IDs.
 * Derived only from the exercises that carry each ID in reference.json
 * (e.g. ID 1 is on Abdominal Crunches, Sit-Ups, Plank, Russian Twist —
 * all abs; ID 6 is on every Push-Ups variant — chest; ID 11 is on every
 * Calf Raise — calves). ID 12 has a single exercise (Supine Push Up) and
 * is deliberately left unmapped. These are general movement groups, not
 * a medical or professional assessment, and the screen says so. */
export const MUSCLE_GROUPS = {
  1: 'Abs & Core',
  2: 'Back',
  3: 'Triceps',
  4: 'Biceps',
  6: 'Chest',
  7: 'Shoulders',
  8: 'Legs',
  9: 'Legs & Glutes',
  10: 'Glutes & Hips',
  11: 'Calves',
  13: 'Back & Core',
  16: 'Inner Thighs & Hips',
};

/** Focus areas for one exercise, for the Muscle tab.
 * 1. A muscle phrase written in the source guidance itself ("This exercise
 *    works the chest, shoulders, triceps…") is shown verbatim when present.
 * 2. Otherwise the mapped groups for its major muscle IDs.
 * 3. Otherwise the focus area of the program it is shown from
 *    (focusLabel, e.g. "Chest"), so the tab is never an empty excuse.
 * Returns {groups, guidancePhrase, sourceIds}. */
export function muscleGroupsFor(exercise, focusLabel) {
  const ids = [...new Set((exercise?.majorMuscleIds || []).map(String))];
  const groups = [];
  for (const id of ids) if (MUSCLE_GROUPS[id] && !groups.includes(MUSCLE_GROUPS[id])) groups.push(MUSCLE_GROUPS[id]);
  let guidancePhrase = null;
  const m = String(exercise?.guidance || '').match(/(?:works|targets|primarily works)\s+(?:the|your)\s+([^.;\n]{3,80})/i);
  if (m) guidancePhrase = m[1].replace(/\s+/g, ' ').trim();
  if (!groups.length && focusLabel) groups.push(focusLabel);
  return { groups, guidancePhrase, sourceIds: ids };
}

/** Which bundled routine a Discover catalog entry plays.
 * The catalog has no ordered sequence in the source data, so nothing is
 * invented: the entry plays the closest real bundled program, Day 1, and
 * the screen names that program. Keyword order matters: 'arm' is checked
 * before 'push_up' so "no_pushups_arm_workout" maps to Arms, while plain
 * "beginner_push_up" maps to Chest.
 * entry: {id, nameKey, level}; programIds: the real program IDs.
 * Returns {programId, day:0, focus, note}. */
const LEVEL_NUM = { beginner: 1, intermediate: 2, advanced: 3 };
export function discoverRoutineFor(entry, programIds) {
  const id = String(entry?.id || '');
  if (programIds?.includes(id)) {
    return { programId: id, day: 0, focus: 'program', note: 'This catalog entry is the bundled program itself.' };
  }
  // Whole-word tokens only: substring matching misfires ("warm_up" contains
  // "arm", "burning" contains "burn" only as a token check, etc.).
  const tokens = String(entry?.nameKey || '').toLowerCase().split('_').filter(Boolean);
  const has = (...words) => words.some((w) => tokens.includes(w));
  const key = String(entry?.nameKey || '').toLowerCase();
  const level = LEVEL_NUM[String(entry?.level || '').toLowerCase()] || 1;
  const focus = (code) => `d_${code}_${level}`;
  const full = `7__4_${['beginner', 'intermediate', 'advance'][level - 1]}`;
  let programId, focusName;
  if (has('shoulder', 'shoulders')) { programId = focus('sh'); focusName = 'Shoulders'; }
  else if (has('arm', 'arms')) { programId = focus('ar'); focusName = 'Arms'; }
  else if (has('chest', 'push') || key.includes('man_boobs')) { programId = focus('ch'); focusName = 'Chest'; }
  else if (has('abs', 'core', 'plank', 'six', 'belly') || key.includes('v_lines') || key.includes('last_longer')) { programId = focus('ab'); focusName = 'Abs & Core'; }
  else if (has('leg', 'legs', 'butt', 'thigh', 'calf')) { programId = focus('le'); focusName = 'Legs'; }
  else { programId = full; focusName = 'Full Body'; }
  const isStretch = has('stretch', 'stretching', 'sleep', 'warm', 'warmup', 'neck', 'knee', 'relief');
  return {
    programId,
    day: 0,
    focus: focusName,
    note: isStretch
      ? 'No stretch routine is bundled, so this plays the closest full-body routine — the catalog’s own sequence is not in the source data.'
      : 'The catalog’s own exercise sequence is not in the source data, so this plays the closest bundled routine.',
  };
}
