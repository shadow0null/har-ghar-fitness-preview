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

/** Per-exercise totals from RECORDED sessions only (v5.17).
 * A session contributes one entry per step with an explicit result: 'done'
 * adds reps (rep-mode value) or seconds (timed-mode value), 'skipped'
 * counts as skipped. Steps with no recorded result add nothing — a missing
 * result is never guessed as done or skipped. Preview sessions are never
 * in history, but are skipped defensively. Partial sessions (completed
 * false) count: their done steps really happened; streak and weekly-goal
 * filters stay completed-only elsewhere. Within one session an exercise
 * that appears twice is reported once, with its done/skipped counts and
 * totals combined. Sorted by most done, then by exercise id for a stable
 * order. Every number comes from recorded results — nothing is estimated
 * or invented here. */
export function aggregateExerciseStats(history) {
  const byId = new Map();
  for (const s of (Array.isArray(history) ? history : [])) {
    if (!s || typeof s !== 'object' || s.preview) continue;
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const results = s.results || {};
    const perSession = new Map();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || step.exerciseId == null) continue;
      const r = results[i] ?? results[String(i)];
      if (r !== 'done' && r !== 'skipped') continue;
      const id = String(step.exerciseId);
      let occ = perSession.get(id);
      if (!occ) { occ = { done: 0, skipped: 0, reps: 0, seconds: 0 }; perSession.set(id, occ); }
      if (r === 'done') {
        occ.done++;
        if (step.mode === 'reps') occ.reps += Number(step.value) || 0;
        else if (step.mode === 'timed') occ.seconds += Number(step.value) || 0;
      } else occ.skipped++;
    }
    for (const [id, occ] of perSession) {
      let row = byId.get(id);
      if (!row) { row = { exerciseId: id, done: 0, skipped: 0, reps: 0, seconds: 0, sessions: [] }; byId.set(id, row); }
      row.done += occ.done; row.skipped += occ.skipped; row.reps += occ.reps; row.seconds += occ.seconds;
      row.sessions.push({
        sessionId: s.id ?? null, finishedAt: s.finishedAt || null, completed: !!s.completed,
        programId: s.programId ?? null, dayId: s.dayId ?? null,
        done: occ.done, skipped: occ.skipped, reps: occ.reps, seconds: occ.seconds,
      });
    }
  }
  return [...byId.values()].sort((a, b) => (b.done - a.done) || (a.exerciseId < b.exerciseId ? -1 : 1));
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
  if (/\bdumbbell\b/.test(tipText) && !/\bdumbbell\b/.test(intro)) optional.push('dumbbell');
  if (/\bdumbbell\b/.test(intro)) setup.push('dumbbell');
  return { setup, optional };
}

/** Animation status line for a program step row. Uses only the joined media
 * record — an exercise with no licensed Lottie file is preview-only. */
export function animationStatus(e) {
  return e?.media?.format === 'lottie' ? 'Animation' : 'No animation';
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
    return { programId: id, day: 0, focus: 'program', note: 'This entry is the program itself.' };
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
      ? 'No stretch routine is available, so this plays the closest full-body routine.'
      : 'This entry doesn’t have its own sequence, so it plays the closest routine.',
  };
}

/** Fix-pass helpers (v11). All pure, so node tests can import them. */

/** Training quick-chip id -> dayTags key. 'burn' has no dayTags key of its
 * own: Burn Fat means the same cardio-leaning definition as the Challenge
 * "Lose Weight" filter (the 'weight' tag), so it maps there instead of
 * matching nothing. Every other chip id already is a dayTags key. */
export function quickChipTag(id) {
  return id === 'burn' ? 'weight' : id;
}

/** "For Beginners" section membership: only items whose catalog level is
 * Beginner, or whose level is not recorded at all. A known Intermediate
 * item (e.g. the No Pushups Arm Workout) is excluded, not relabelled. */
export function isBeginnerCatalogItem(record) {
  const level = String(record?.level || '').toLowerCase();
  return level === '' || level === 'beginner';
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Sessions stepper that preserves the existing day selection: growing
 * keeps every planned day and adds the next unplanned day in week order;
 * shrinking drops the last planned day. Days are always returned sorted
 * Mon..Sun. Used by the Workout Settings sessions stepper and tested. */
export function adjustPlannedDays(current, newCount) {
  const target = Math.min(7, Math.max(1, newCount));
  const cur = [...new Set((current || []).filter((d) => WEEKDAY_NAMES.includes(d)))];
  while (cur.length < target) {
    const next = WEEKDAY_NAMES.find((d) => !cur.includes(d));
    if (!next) break;
    cur.push(next);
  }
  while (cur.length > target) cur.pop();
  return cur.sort((a, b) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b));
}

/** Day-by-day comparison of two bundled programs (same shape as
 * reference.json programs: {days: [{steps: [{exerciseId, mode, value}]}]}).
 * Returns how many days differ in exercises or values, how many match
 * exactly, whether Day 1 matches, and the total differing steps. Used to
 * surface the real difference between "Lower Body · 28 Days" and its
 * "(Updated)" variant instead of inventing one. */
export function compareProgramDays(a, b) {
  const daysA = a?.days || [];
  const daysB = b?.days || [];
  const n = Math.max(daysA.length, daysB.length);
  let daysDiffer = 0;
  let stepDiffs = 0;
  let day1Same = false;
  for (let d = 0; d < n; d++) {
    const sa = daysA[d]?.steps || [];
    const sb = daysB[d]?.steps || [];
    let diff = 0;
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const x = sa[i];
      const y = sb[i];
      if (!x || !y || String(x.exerciseId) !== String(y.exerciseId) || x.mode !== y.mode || String(x.value) !== String(y.value)) diff++;
    }
    if (diff > 0) daysDiffer++;
    else if (d === 0) day1Same = true;
    stepDiffs += diff;
  }
  return { days: n, daysDiffer, daysSame: n - daysDiffer, stepDiffs, day1Same };
}

// ---- Measurements (weight / height / BMI) --------------------------------
// Pure helpers, unit-testable in Node. BMI uses the standard adult formula
// weight(kg) / height(m)^2. Range labels are the standard adult ranges only;
// no diagnosis, no targets, no recommendations.
export function calcBmi(weightKg, heightCm) {
  const w = Number(weightKg), h = Number(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const v = w / ((h / 100) * (h / 100));
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}
export function bmiRange(bmi) {
  if (bmi == null || !Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}
function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
export function normalizeMeasurement(e) {
  if (!e || typeof e !== 'object') return null;
  if (!isValidISODate(e.date)) return null;
  const w = Number(e.weightKg), h = Number(e.heightCm);
  if (!Number.isFinite(w) || w < 2 || w > 500) return null;
  if (!Number.isFinite(h) || h < 30 || h > 300) return null;
  const u = Number(e.updatedAt);
  return { date: e.date, weightKg: w, heightCm: h, updatedAt: Number.isFinite(u) ? u : 0 };
}
export function sortMeasurementsDesc(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}
export function latestMeasurement(list) {
  const sorted = sortMeasurementsDesc(list);
  return sorted.length ? sorted[0] : null;
}
export function todayISO(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---- Workout-based personalization ("For you" on Training) ----------------
// Pure computation over sessions the user already recorded + catalog
// programs + preferences they already set. No DOM, no network, no new
// data collection: nothing here reads location, analytics, advertising or
// any third-party data, and nothing new is stored — the section derives
// at render time from history/prefs that already sync, so guests work
// from device history exactly like the rest of the app.
//
// DAY-INDEX FINDING (verified against app.js + engine.js, 2026-10-30):
// the player stores dayId as the 1-based day NUMBER as a string —
// start() passes dayId String(active.day+1) where active.day is the
// 0-based calendar index, and engine.start() stores it as given. So a
// Day-1 workout carries dayId "1", and the 0-based index used by
// stepsFor()/route.day is Number(dayId) - 1. Report and the per-exercise
// screen render `Day ${+dayId+1}`, which shows one MORE than the day
// actually done for real player sessions — a pre-existing display
// discrepancy in those two screens, deliberately NOT changed here
// (this change touches Training only). sessionDayIndex() therefore
// treats n >= 1 as a day number (index n-1) and n === 0 as a legacy
// 0-based fixture (index 0); null/NaN/negative dayIds are unusable.
// A recorded partial session is NEVER resumed mid-workout: engine
// restore() only resumes the currently open, unfinished session from
// its checkpoint, and history entries are never reopened into the
// player — so a partial Continue restarts its day from step 1, and
// the card says so ("Starts from the beginning").
const PERSONAL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
/** Single focus area for a program, or null when none can be derived.
 * Numeric 28-day series programs and custom programs have no single
 * focus, so they contribute no focus count and can never be recommended
 * on focus grounds — inventing one for them would be fake
 * personalization. */
export function programFocusLabel(program) {
  const id = String(program?.id || '');
  const m = id.match(/^d_(ab|ar|ch|le|sh)_/);
  if (m) return { ab: 'Abs', ar: 'Arms', ch: 'Chest', le: 'Legs', sh: 'Shoulders' }[m[1]];
  if (/^7__4_/.test(id)) return 'Full Body';
  if (/^upper_[123]$/.test(id)) return 'Upper Body';
  if (id === 'lower' || id === 'lower_new') return 'Lower Body';
  return null;
}
/** 0-based day index for a recorded session, or null when unusable. */
export function sessionDayIndex(session) {
  if (!session || session.dayId == null) return null;
  const n = Number(session.dayId);
  if (!Number.isFinite(n) || n < 0) return null;
  return n >= 1 ? Math.floor(n) - 1 : 0;
}
function doneStepCount(session) {
  const results = session?.results || {};
  return Object.values(results).filter((r) => r === 'done').length;
}
/** Continue target for one recorded session, or null.
 * Partial → the same day again if still startable, else the next
 * startable day at/after it; completed → the next startable day after
 * it; if no later startable day exists → Day 1 ("Start again") if
 * startable. A day that is no longer startable (e.g. edited into a
 * preview-only day) is never offered. */
function continueTarget(program, session, dayIndex, isStartable) {
  const days = program.days.length;
  const start = session.completed ? dayIndex + 1 : dayIndex;
  for (let i = start; i < days; i++) {
    if (isStartable(String(program.id), i)) {
      return { programId: String(program.id), dayIndex: i, dayNumber: i + 1, kind: i === dayIndex ? 'pickup' : 'next', lastDayNumber: dayIndex + 1, partial: !session.completed, doneSteps: doneStepCount(session), totalSteps: Array.isArray(session.steps) ? session.steps.length : 0 };
    }
  }
  if (isStartable(String(program.id), 0)) {
    return { programId: String(program.id), dayIndex: 0, dayNumber: 1, kind: 'restart', lastDayNumber: dayIndex + 1, partial: !session.completed, doneSteps: doneStepCount(session), totalSteps: Array.isArray(session.steps) ? session.steps.length : 0 };
  }
  return null;
}
/** Recommendation from COMPLETED sessions only, or null.
 * Top focus = most completed sessions, ties broken by latest completion
 * then focus name (fully deterministic). Target level = the next level
 * up when the user completed a routine at their current level in that
 * focus, otherwise their level; if no untried startable program exists
 * at the target level, same-level untried programs are tried before
 * giving up. "Tried" means any recorded (non-preview) session for that
 * program, completed or partial. Candidates must have a startable Day 1
 * (the card opens Day 1) and are ordered by program id, so the same
 * history always recommends the same program. */
function recommendationTarget(recorded, byId, prefs, isStartable, triedIds) {
  const counts = new Map();
  for (const { s, i } of recorded) {
    if (!s.completed) continue;
    const p = byId.get(String(s.programId));
    if (!p) continue;
    const focus = programFocusLabel(p);
    if (!focus) continue;
    const t = Date.parse(s.finishedAt || '') || 0;
    const cur = counts.get(focus) || { count: 0, latest: 0, latestIdx: -1 };
    cur.count++;
    if (t > cur.latest || (t === cur.latest && i > cur.latestIdx)) { cur.latest = t; cur.latestIdx = i; }
    counts.set(focus, cur);
  }
  if (!counts.size) return null;
  const [focus, info] = [...counts.entries()].sort((a, b) => (b[1].count - a[1].count) || (b[1].latest - a[1].latest) || (a[0] < b[0] ? -1 : 1))[0];
  const userLevel = PERSONAL_LEVELS.includes(prefs?.level) ? prefs.level : 'Beginner';
  let completedAtLevel = false;
  for (const { s } of recorded) {
    if (!s.completed) continue;
    const p = byId.get(String(s.programId));
    if (p && programFocusLabel(p) === focus && difficultyBolts(p).level === userLevel) { completedAtLevel = true; break; }
  }
  const li = PERSONAL_LEVELS.indexOf(userLevel);
  const preferred = completedAtLevel && li < PERSONAL_LEVELS.length - 1 ? PERSONAL_LEVELS[li + 1] : userLevel;
  const levelsToTry = preferred === userLevel ? [userLevel] : [preferred, userLevel];
  for (const level of levelsToTry) {
    const candidates = [...byId.values()].filter((p) => {
      if (!p || !Array.isArray(p.days) || !p.days.length) return false;
      if (programFocusLabel(p) !== focus) return false;
      if (difficultyBolts(p).level !== level) return false;
      if (triedIds.has(String(p.id))) return false;
      return isStartable(String(p.id), 0);
    }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (candidates.length) {
      return { programId: String(candidates[0].id), dayIndex: 0, focus, focusCount: info.count, userLevel, targetLevel: level, levelUp: level !== userLevel };
    }
  }
  return null;
}
/** The "For you" data for Training, or {continue: null, recommendation:
 * null} when there is nothing honest to show. history entries with
 * preview set are excluded defensively (the engine never records
 * previews, but a synced preview record must never drive the section).
 * The Continue basis is the newest recorded session whose program still
 * exists; if that session's day is unusable or has no startable target,
 * Continue is null — an older workout is never silently substituted.
 * isStartable(programId, dayIndex) is supplied by the caller (the app
 * passes canTrain(stepsFor(...))) so startability has exactly one
 * definition; tests pass a stub. */
export function computePersonalization(history, programs, prefs, isStartable) {
  const list = Array.isArray(programs) ? programs : [...(programs?.values?.() || [])];
  const byId = new Map(list.filter((p) => p && p.id != null).map((p) => [String(p.id), p]));
  const startable = typeof isStartable === 'function' ? isStartable : () => false;
  const recorded = (Array.isArray(history) ? history : [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s && typeof s === 'object' && !s.preview && s.programId != null);
  if (!recorded.length) return { continue: null, recommendation: null, starter: computeStarterTarget(list, prefs, startable) };
  const byRecency = [...recorded].sort((a, b) => {
    const fa = Date.parse(a.s.finishedAt || '') || 0, fb = Date.parse(b.s.finishedAt || '') || 0;
    return (fb - fa) || (b.i - a.i);
  });
  let cont = null;
  for (const { s } of byRecency) {
    const p = byId.get(String(s.programId));
    if (!p || !Array.isArray(p.days) || !p.days.length) continue;
    const dayIndex = sessionDayIndex(s);
    if (dayIndex == null || dayIndex < 0 || dayIndex >= p.days.length) break;
    cont = continueTarget(p, s, dayIndex, startable);
    break;
  }
  const triedIds = new Set(recorded.map(({ s }) => String(s.programId)));
  const recommendation = recommendationTarget(recorded, byId, prefs, startable, triedIds);
  return { continue: cont, recommendation, starter: null };
}

/** Starter target for a user with NO recorded (non-preview) history, or
 * null. Selection uses prefs.level ONLY: the user's level is the one
 * stored prefs field with an honest program mapping (single-day focus
 * programs carry their level in the id, via difficultyBolts). prefs.goal
 * ('Build consistency' / 'General fitness' / 'Mobility') has no program
 * mapping anywhere in the code, prefs.comfort has no program-level
 * suitability data (onboarding itself says programs need a suitability
 * review and claims no automatic safe replacement), and prefs.frequency
 * is a weekly session count, not a program attribute — so none of those
 * three is claimed as a selection reason, and the card basis line names
 * the level only. Candidates are single-day focus programs at the level
 * with a startable Day 1, id-ordered; fallback is any program at the
 * level with a startable Day 1, id-ordered. A user whose history exists
 * but yields no card never gets a starter: computePersonalization only
 * calls this when recorded history is empty. */
export function computeStarterTarget(programs, prefs, isStartable) {
  const list = Array.isArray(programs) ? programs : [...(programs?.values?.() || [])];
  const startable = typeof isStartable === 'function' ? isStartable : () => false;
  const level = PERSONAL_LEVELS.includes(prefs?.level) ? prefs.level : 'Beginner';
  const usable = list.filter((p) => p && p.id != null && Array.isArray(p.days) && p.days.length && startable(String(p.id), 0));
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const single = usable.filter((p) => p.days.length === 1 && programFocusLabel(p) && difficultyBolts(p).level === level).sort(byId);
  if (single.length) return { programId: String(single[0].id), dayIndex: 0, level, focus: programFocusLabel(single[0]) };
  const any = usable.filter((p) => difficultyBolts(p).level === level).sort(byId);
  if (any.length) return { programId: String(any[0].id), dayIndex: 0, level, focus: programFocusLabel(any[0]) };
  return null;
}

/** Top completed focus (most completed sessions, ties by latest
 * completion then focus name — the same deterministic rule as the
 * recommendation), or null when no completed session has a focus. */
function topCompletedFocus(recorded, byId) {
  const counts = new Map();
  for (const { s, i } of recorded) {
    if (!s.completed) continue;
    const p = byId.get(String(s.programId));
    if (!p) continue;
    const focus = programFocusLabel(p);
    if (!focus) continue;
    const t = Date.parse(s.finishedAt || '') || 0;
    const cur = counts.get(focus) || { count: 0, latest: 0, latestIdx: -1 };
    cur.count++;
    if (t > cur.latest || (t === cur.latest && i > cur.latestIdx)) { cur.latest = t; cur.latestIdx = i; }
    counts.set(focus, cur);
  }
  if (!counts.size) return null;
  const [focus, info] = [...counts.entries()].sort((a, b) => (b[1].count - a[1].count) || (b[1].latest - a[1].latest) || (a[0] < b[0] ? -1 : 1))[0];
  return { focus, count: info.count };
}

/** Discover personal row, or null. Only when completed history exists:
 * up to 6 programs in the top completed focus with a startable Day 1,
 * untried first (id-ordered), then tried (id-ordered). Preview sessions
 * are excluded, partial sessions never count toward the focus, and no
 * level filter is applied here — the row is focus-matched only, and the
 * basis text says exactly that. */
export function discoverPersonalRow(history, programs, isStartable) {
  const list = Array.isArray(programs) ? programs : [...(programs?.values?.() || [])];
  const byId = new Map(list.filter((p) => p && p.id != null).map((p) => [String(p.id), p]));
  const startable = typeof isStartable === 'function' ? isStartable : () => false;
  const recorded = (Array.isArray(history) ? history : [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s && typeof s === 'object' && !s.preview && s.programId != null);
  const top = topCompletedFocus(recorded, byId);
  if (!top) return null;
  const triedIds = new Set(recorded.map(({ s }) => String(s.programId)));
  const candidates = list.filter((p) => p && programFocusLabel(p) === top.focus && Array.isArray(p.days) && p.days.length && startable(String(p.id), 0));
  const byIdSort = (a, b) => String(a.id).localeCompare(String(b.id));
  const untried = candidates.filter((p) => !triedIds.has(String(p.id))).sort(byIdSort);
  const tried = candidates.filter((p) => triedIds.has(String(p.id))).sort(byIdSort);
  const programIds = [...untried, ...tried].slice(0, 6).map((p) => String(p.id));
  if (!programIds.length) return null;
  return { focus: top.focus, focusCount: top.count, programIds };
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function mondayOfWeek(now) { const d = startOfDay(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }

/** ONE honest Report next-step line, or null (never, in practice — the
 * no-history case still yields a goal line). Computed only from
 * completed, non-preview sessions and prefs.frequency; preview sessions
 * never count, and nothing is guessed. Priority: no completed sessions
 * → start line; last completed session 3+ days ago → return-after-gap
 * line (streak is 0 by construction then); this week's completed count
 * below the weekly goal → remaining-sessions line; otherwise the goal
 * is reached, with the streak milestone stated exactly (a session today
 * makes it streak+1 only when today has no completed session yet).
 * `nowMs` exists only so tests can fix "today"; the app calls without
 * it. Streak uses the app's rule: consecutive completed days ending
 * today, or yesterday when today has none yet. */
export function computeReportNudge(history, prefs, nowMs = Date.now()) {
  const freqRaw = Number(prefs?.frequency);
  const weekGoal = Number.isFinite(freqRaw) && freqRaw >= 1 ? Math.floor(freqRaw) : 3;
  const completed = (Array.isArray(history) ? history : []).filter((s) => s && typeof s === 'object' && !s.preview && s.completed);
  if (!completed.length) {
    return { kind: 'start', streak: 0, weekDone: 0, weekGoal, daysSinceLast: null, line: `No completed sessions yet. Your weekly goal is ${weekGoal} session${weekGoal === 1 ? '' : 's'} — start with Day 1 of a routine.` };
  }
  const now = new Date(nowMs);
  const todayStr = startOfDay(now).toDateString();
  const daySet = new Set(completed.map((s) => new Date(s.finishedAt).toDateString()).filter((x) => x !== 'Invalid Date'));
  let streak = 0;
  const cursor = startOfDay(now);
  if (!daySet.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(cursor.toDateString())) { streak++; cursor.setDate(cursor.getDate() - 1); }
  const weekStart = mondayOfWeek(now);
  const weekDone = completed.filter((s) => new Date(s.finishedAt) >= weekStart).length;
  const lastMs = Math.max(...completed.map((s) => Date.parse(s.finishedAt || '')).filter((n) => Number.isFinite(n)));
  const daysSinceLast = Number.isFinite(lastMs) ? Math.floor((startOfDay(now) - startOfDay(lastMs)) / 86400000) : null;
  if (daysSinceLast != null && daysSinceLast >= 3) {
    return { kind: 'gap', streak, weekDone, weekGoal, daysSinceLast, line: `It's been ${daysSinceLast} days since your last completed session. Your streak is back to 0 — a session today starts a new one.` };
  }
  if (weekDone < weekGoal) {
    const remaining = weekGoal - weekDone;
    return { kind: 'goal', streak, weekDone, weekGoal, daysSinceLast, line: `${weekDone} of ${weekGoal} sessions this week — ${remaining} more to reach your weekly goal.` };
  }
  const todayDone = daySet.has(todayStr);
  return { kind: 'goalReached', streak, weekDone, weekGoal, daysSinceLast, line: todayDone ? `Weekly goal reached (${weekDone} of ${weekGoal}) · day streak ${streak} days, including today.` : `Weekly goal reached (${weekDone} of ${weekGoal}) · day streak ${streak} days — a session today makes it ${streak + 1}.` };
}
