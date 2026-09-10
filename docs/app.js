/* ============================================================
   The Wife's Elephant Reminder — application logic
   No frameworks, no build step, no external requests beyond the
   push sync endpoint. Everything here is meant to still run
   unchanged in a browser many years from now.
   ============================================================ */
'use strict';

/* ---------------------------------------------------------------
   CONFIG — the only place with deployment-specific values.
   WORKER_URL is filled in after the Cloudflare Worker is deployed;
   leaving it empty simply disables push and leaves the calendar
   fallback (which needs no server at all) fully working.
   --------------------------------------------------------------- */
const CONFIG = {
  WORKER_URL: '',
  VAPID_PUBLIC_KEY: 'BOOu8-i86U9eashAbNiGe2NkPABmONeP0sNibQHPb9uUGpq_1NZC2qoY_7JsneYxPCF10v-ZfbjXYk629UBR5iE'
};

const STORE_KEY = 'noa.pill.v1';
const UNDO_MS = 60000;

/* ---------------------------------------------------------------
   Translations
   --------------------------------------------------------------- */
const STRINGS = {
  en: {
    locale: 'en-GB',
    appName: "The Wife's Elephant Reminder",
    tagline: 'An elephant never forgets',
    notYet: 'Not yet today',
    notYetSub: 'Tap below when you take it',
    takenTitle: 'All done today',
    takenSub: 'Taken at {time}',
    takenSubLate: 'Marked later · {time}',
    markBtn: 'I took it',
    undoText: 'Marked as taken',
    undoBtn: 'Undo',
    streakDays: '{n}-day streak',
    streakNone: 'Your first day starts now',
    nextReminder: 'Next reminder at {time}',
    noReminders: 'No reminders set',
    remindersOffToday: 'No more reminders today',
    refillWarn: 'Only {n} left — time to refill',
    refillOut: 'You are out of pills',
    installNudge: 'Add me to your Home Screen so reminders can reach you.',
    installLink: 'Show me how →',

    tabToday: 'Today', tabHistory: 'History', tabSettings: 'Settings',

    legTaken: 'Taken', legMissed: 'Not marked', legLate: 'Added later',
    statTaken: 'taken', statStreak: 'best streak', statRate: 'this month',
    exportCsv: 'Export history (CSV)',

    settingsTitle: 'Settings',
    lblLook: 'Look', themeSoft: 'Soft', themeCalm: 'Calm',
    lblLanguage: 'Language',
    lblPill: 'The pill',
    lblPillName: 'Name (optional)',
    pillPlaceholder: 'e.g. vitamin D',
    lblRollover: 'New day starts at',
    hintRollover: 'If you sometimes take it late at night, keep this at 4:00 so a late dose still counts for the right day.',

    lblReminders: 'Reminders',
    addReminder: '+ Add a reminder',
    exportIcs: 'Also add these to my Calendar',
    hintIcs: 'A backup that works even with no internet: this adds your reminder times to the iPhone Calendar as repeating alerts. They reach your Apple Watch too.',
    pushBlocked: 'Notifications were blocked. To turn them back on: iPhone Settings → Notifications → Elephant.',
    pushNeedInstall: 'To get notifications, this needs to be added to your Home Screen first. <a href="install.html">How to do that →</a>',
    pushOn: 'Notifications are on. They will appear on your iPhone and Apple Watch, and stop for the day as soon as you mark the pill taken.',
    pushFailed: 'Could not turn on notifications. Check your internet and try again.',
    pushNotSetUp: 'Push notifications are not connected yet. In the meantime use “Also add these to my Calendar” below — those alerts reach your Apple Watch too.',

    everyDay: 'Every day', daysNone: 'Never', editWord: 'Edit',
    remNewTitle: 'New reminder', remEditTitle: 'Edit reminder',
    lblRemTime: 'Time', hintRemDays: 'Tap the days this reminder should repeat on. Turn all of them off to pause it.',
    remSave: 'Save', remDelete: 'Delete this reminder', remCancel: 'Cancel',

    lblRefill: 'Refill tracking',
    lblRefillLeft: 'Pills left', lblRefillWarn: 'Warn me at',
    refillReset: 'I opened a new pack',
    refillAsk: 'How many pills in the new pack?',

    lblBackup: 'Backup',
    hintBackup: 'Saves your whole history to a file. Keep it in iCloud Drive — it is how a new phone inherits your history.',
    backupBtn: 'Save a backup', restoreBtn: 'Restore from a backup',
    restoreConfirm: 'Replace everything currently in the app with this backup?',
    restoreDone: 'Backup restored', restoreBad: 'That file could not be read',

    daySheetTaken: 'Taken at {time}', daySheetLate: 'Marked later · {time}',
    daySheetNot: 'Not marked as taken',
    dayMark: 'Mark this day as taken', dayUnmark: 'Remove the mark', dayClose: 'Close',
    dayFuture: 'This day has not happened yet',

    savedToast: 'Saved', copiedToast: 'File ready',
    about: "The Wife's Elephant Reminder · your data stays on this phone"
  },

  he: {
    locale: 'he-IL',
    appName: 'תזכורת הפיל של אשתי',
    tagline: 'פיל לעולם לא שוכח',
    notYet: 'עדיין לא היום',
    notYetSub: 'לחצי כאן כשתיקחי',
    takenTitle: 'לקחת היום',
    takenSub: 'נלקחה ב-{time}',
    takenSubLate: 'סומן בדיעבד · {time}',
    markBtn: 'לקחתי',
    undoText: 'סומן כנלקח',
    undoBtn: 'ביטול',
    streakDays: 'רצף של {n} ימים',
    streakNone: 'היום הראשון מתחיל עכשיו',
    nextReminder: 'התזכורת הבאה ב-{time}',
    noReminders: 'לא הוגדרו תזכורות',
    remindersOffToday: 'אין עוד תזכורות היום',
    refillWarn: 'נשארו {n} בלבד — כדאי לחדש',
    refillOut: 'נגמרו הכדורים',
    installNudge: 'הוסיפי אותי למסך הבית כדי שהתזכורות יגיעו אלייך.',
    installLink: 'איך עושים את זה ←',

    tabToday: 'היום', tabHistory: 'יומן', tabSettings: 'הגדרות',

    legTaken: 'נלקחה', legMissed: 'לא סומן', legLate: 'סומן בדיעבד',
    statTaken: 'נלקחו', statStreak: 'הרצף הארוך', statRate: 'החודש',
    exportCsv: 'ייצוא היסטוריה (CSV)',

    settingsTitle: 'הגדרות',
    lblLook: 'מראה', themeSoft: 'רך', themeCalm: 'רגוע',
    lblLanguage: 'שפה',
    lblPill: 'הכדור',
    lblPillName: 'שם (לא חובה)',
    pillPlaceholder: 'למשל ויטמין D',
    lblRollover: 'יום חדש מתחיל ב',
    hintRollover: 'אם לפעמים את לוקחת מאוחר בלילה, השאירי על 4:00 כדי שהמינון המאוחר עדיין ייספר ליום הנכון.',

    lblReminders: 'תזכורות',
    addReminder: '+ הוספת תזכורת',
    exportIcs: 'להוסיף את אלה גם ליומן',
    hintIcs: 'גיבוי שעובד גם בלי אינטרנט: מוסיף את שעות התזכורת ליומן של האייפון כהתראות חוזרות. הן מגיעות גם לשעון.',
    pushBlocked: 'ההתראות חסומות. להפעלה מחדש: הגדרות → התראות → Elephant.',
    pushNeedInstall: 'כדי לקבל התראות צריך קודם להוסיף את האפליקציה למסך הבית. <a href="install.html">איך עושים את זה ←</a>',
    pushOn: 'ההתראות פועלות. הן יופיעו באייפון ובשעון, וייפסקו לאותו יום ברגע שתסמני שלקחת.',
    pushFailed: 'לא הצלחנו להפעיל התראות. בדקי את החיבור לאינטרנט ונסי שוב.',
    pushNotSetUp: 'התראות ה-Push עדיין לא מחוברות. בינתיים השתמשי ב־“להוסיף את אלה גם ליומן” למטה — ההתראות האלה מגיעות גם לשעון.',

    everyDay: 'כל יום', daysNone: 'אף פעם', editWord: 'עריכה',
    remNewTitle: 'תזכורת חדשה', remEditTitle: 'עריכת תזכורת',
    lblRemTime: 'שעה', hintRemDays: 'סמני את הימים שבהם התזכורת תחזור. כיבוי כל הימים משהה אותה.',
    remSave: 'שמירה', remDelete: 'מחיקת התזכורת', remCancel: 'ביטול',

    lblRefill: 'מעקב מלאי',
    lblRefillLeft: 'כדורים שנשארו', lblRefillWarn: 'להתריע כשנשארו',
    refillReset: 'פתחתי אריזה חדשה',
    refillAsk: 'כמה כדורים יש באריזה החדשה?',

    lblBackup: 'גיבוי',
    hintBackup: 'שומר את כל ההיסטוריה לקובץ. כדאי לשמור אותו ב-iCloud Drive — כך טלפון חדש יירש את ההיסטוריה.',
    backupBtn: 'שמירת גיבוי', restoreBtn: 'שחזור מגיבוי',
    restoreConfirm: 'להחליף את כל מה שיש כרגע באפליקציה בגיבוי הזה?',
    restoreDone: 'הגיבוי שוחזר', restoreBad: 'לא הצלחנו לקרוא את הקובץ',

    daySheetTaken: 'נלקחה ב-{time}', daySheetLate: 'סומן בדיעבד · {time}',
    daySheetNot: 'לא סומן כנלקח',
    dayMark: 'סימון היום הזה כנלקח', dayUnmark: 'הסרת הסימון', dayClose: 'סגירה',
    dayFuture: 'היום הזה עוד לא הגיע',

    savedToast: 'נשמר', copiedToast: 'הקובץ מוכן',
    about: 'תזכורת הפיל של אשתי · המידע נשאר בטלפון הזה'
  }
};

/* ---------------------------------------------------------------
   State
   --------------------------------------------------------------- */
const DEFAULTS = () => ({
  v: 1,
  settings: {
    theme: 'soft',
    lang: 'en',
    rolloverHour: 4,
    pillName: '',
    reminders: {
      enabled: false,
      items: [{ id: rid(), time: '09:00', days: [0, 1, 2, 3, 4, 5, 6] }]
    },
    refill: { enabled: false, left: 28, packSize: 28, warnAt: 5, lastDay: null }
  },
  log: {},          // 'YYYY-MM-DD' -> { at: ISO string, late: boolean }
  push: { subId: null, enabled: false }
});

let S = load();
let calMonth = null;      // Date anchored to the 1st of the displayed month
let undoTimer = null;
let sheetDayKey = null;
let editingReminder = null;

function rid() { return Math.random().toString(36).slice(2, 10); }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    // Shallow-merge so a state file written by an older version still loads.
    return {
      ...base, ...parsed,
      settings: {
        ...base.settings, ...(parsed.settings || {}),
        reminders: { ...base.settings.reminders, ...((parsed.settings || {}).reminders || {}) },
        refill: { ...base.settings.refill, ...((parsed.settings || {}).refill || {}) }
      },
      log: parsed.log || {},
      push: { ...base.push, ...(parsed.push || {}) }
    };
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return DEFAULTS();
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { console.warn('Could not save.', e); }
}

/* ---------------------------------------------------------------
   Dates
   The "day" does not start at midnight — it starts at rolloverHour,
   so a dose taken at 23:40 still belongs to that evening's day.
   --------------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, '0');

function dayKeyOf(date = new Date()) {
  const shifted = new Date(date.getTime() - S.settings.rolloverHour * 3600000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function keyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The moment the current day flips over — used to tell the push
 *  server how long to stay quiet after she marks the pill taken. */
function nextRollover() {
  const now = new Date();
  const r = new Date(now);
  r.setHours(S.settings.rolloverHour, 0, 0, 0);
  if (r <= now) r.setDate(r.getDate() + 1);
  return r;
}

function T() { return STRINGS[S.settings.lang] || STRINGS.en; }
function t(key, vars) {
  let s = T()[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

const fmtTime = (d) => new Date(d).toLocaleTimeString(T().locale, { hour: '2-digit', minute: '2-digit' });
const fmtDateLong = (d) => d.toLocaleDateString(T().locale, { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------------------------------------------------------------
   Core actions
   --------------------------------------------------------------- */
function isTaken(key) { return !!S.log[key]; }

function markTaken(key, late) {
  S.log[key] = { at: new Date().toISOString(), late: !!late };
  // Refill counts down once per day, never twice for the same day.
  const rf = S.settings.refill;
  if (rf.enabled && rf.lastDay !== key) {
    rf.left = Math.max(0, (rf.left || 0) - 1);
    rf.lastDay = key;
  }
  save();
  syncPush();
  renderAll();
}

function unmark(key) {
  const rf = S.settings.refill;
  if (S.log[key] && rf.enabled && rf.lastDay === key) {
    rf.left = (rf.left || 0) + 1;
    rf.lastDay = null;
  }
  delete S.log[key];
  save();
  syncPush();
  renderAll();
}

/** Consecutive taken days ending today (or yesterday, if today is still open). */
function currentStreak() {
  let n = 0;
  const d = new Date();
  if (!isTaken(dayKeyOf(d))) d.setDate(d.getDate() - 1);
  for (;;) {
    if (!isTaken(dayKeyOf(d))) break;
    n++;
    d.setDate(d.getDate() - 1);
    if (n > 4000) break;
  }
  return n;
}

function bestStreak() {
  const keys = Object.keys(S.log).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const d = new Date(k + 'T12:00:00');
    if (prev && (d - prev) === 86400000) run++; else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/* ---------------------------------------------------------------
   Rendering — Today
   --------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function renderToday() {
  const key = dayKeyOf();
  const rec = S.log[key];
  const taken = !!rec;

  $('todayDate').textContent = fmtDateLong(new Date());

  $('hero').dataset.state = taken ? 'taken' : 'pending';

  const name = S.settings.pillName.trim();
  $('heroTitle').textContent = taken ? t('takenTitle') : t('notYet');
  $('heroSub').textContent = taken
    ? t(rec.late ? 'takenSubLate' : 'takenSub', { time: fmtTime(rec.at) })
    : (name ? `${name} · ${t('notYetSub')}` : t('notYetSub'));

  $('markBtn').textContent = t('markBtn');
  $('markBtn').hidden = taken;
  $('undoText').textContent = t('undoText');
  $('undoBtn').textContent = t('undoBtn');

  renderStreak();
  renderNextReminder();
  renderRefillHint();
  updateBadge(taken);
}

function renderStreak() {
  const el = $('streak');
  el.innerHTML = '';
  const todayKey = dayKeyOf();

  // Last 7 days, oldest first.
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKeyOf(d);
    const dot = document.createElement('i');
    if (isTaken(k)) dot.className = 'on';
    else if (k === todayKey) dot.className = 'today-pending';
    el.appendChild(dot);
  }

  const n = currentStreak();
  const b = document.createElement('b');
  b.textContent = n > 0 ? t('streakDays', { n }) : t('streakNone');
  el.appendChild(b);
}

function renderNextReminder() {
  const el = $('nextReminder');
  const r = S.settings.reminders;
  if (!r.enabled || !r.items.length) { el.textContent = t('noReminders'); return; }

  const now = new Date();
  const upcoming = r.items
    .filter((it) => it.days.includes(now.getDay()))
    .map((it) => {
      const [h, m] = it.time.split(':').map(Number);
      const when = new Date(now); when.setHours(h, m, 0, 0);
      return when;
    })
    .filter((when) => when > now)
    .sort((a, b) => a - b);

  if (isTaken(dayKeyOf())) el.textContent = t('remindersOffToday');
  else if (upcoming.length) el.textContent = t('nextReminder', { time: fmtTime(upcoming[0]) });
  else el.textContent = t('remindersOffToday');
}

function renderRefillHint() {
  const el = $('refillHint');
  const rf = S.settings.refill;
  if (!rf.enabled) { el.hidden = true; return; }
  if (rf.left <= 0) { el.hidden = false; el.textContent = t('refillOut'); return; }
  if (rf.left <= rf.warnAt) { el.hidden = false; el.textContent = t('refillWarn', { n: rf.left }); return; }
  el.hidden = true;
}

/* ---------------------------------------------------------------
   Rendering — History
   --------------------------------------------------------------- */
function renderHistory() {
  if (!calMonth) { calMonth = new Date(); calMonth.setDate(1); }

  $('monthLabel').textContent =
    calMonth.toLocaleDateString(T().locale, { month: 'long', year: 'numeric' });

  // Weekday header, Sunday-first (matches both English and Hebrew calendars).
  const wd = $('weekdays');
  wd.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 8, 1 + i); // 1 Sep 2024 was a Sunday
    const s = document.createElement('span');
    s.textContent = d.toLocaleDateString(T().locale, { weekday: 'narrow' });
    wd.appendChild(s);
  }

  const grid = $('calGrid');
  grid.innerHTML = '';
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKeyOf();

  for (let i = 0; i < firstDow; i++) {
    const b = document.createElement('button');
    b.className = 'blank'; b.disabled = true; b.tabIndex = -1;
    grid.appendChild(b);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = keyFromDate(date);
    const rec = S.log[key];
    const isFuture = key > todayKey;

    const b = document.createElement('button');
    b.type = 'button';
    if (isFuture) b.classList.add('future');
    if (key === todayKey) b.classList.add('is-today');
    b.dataset.key = key;

    const num = document.createElement('span');
    num.textContent = day;
    b.append(num);
    if (!isFuture) {
      const dot = document.createElement('span');
      dot.className = 'dot ' + (rec ? (rec.late ? 'late' : 'taken') : 'missed');
      b.append(dot);
    }
    b.addEventListener('click', () => openDaySheet(key, isFuture));
    grid.appendChild(b);
  }

  // Don't let her page into months that haven't happened.
  const nowFirst = new Date(); nowFirst.setDate(1); nowFirst.setHours(0, 0, 0, 0);
  $('nextMonth').disabled = calMonth >= nowFirst;

  renderStats(year, month, daysInMonth);
}

function renderStats(year, month, daysInMonth) {
  let takenThisMonth = 0, elapsed = 0;
  const todayKey = dayKeyOf();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = keyFromDate(new Date(year, month, day));
    if (key > todayKey) continue;
    elapsed++;
    if (S.log[key]) takenThisMonth++;
  }
  const rate = elapsed ? Math.round((takenThisMonth / elapsed) * 100) : 0;

  $('stats').innerHTML = '';
  const cells = [
    [takenThisMonth, t('statTaken')],
    [bestStreak(), t('statStreak')],
    [rate + '%', t('statRate')]
  ];
  for (const [big, small] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<b></b><small></small>`;
    d.querySelector('b').textContent = big;
    d.querySelector('small').textContent = small;
    $('stats').appendChild(d);
  }
  $('exportCsv').textContent = t('exportCsv');
  $('legTaken').textContent = t('legTaken');
  $('legMissed').textContent = t('legMissed');
  $('legLate').textContent = t('legLate');
}

/* ---------------------------------------------------------------
   Day sheet (view / backfill a specific day)
   --------------------------------------------------------------- */
function openDaySheet(key, isFuture) {
  sheetDayKey = key;
  const rec = S.log[key];
  const d = new Date(key + 'T12:00:00');

  $('daySheetTitle').textContent = fmtDateLong(d);
  $('daySheetStatus').textContent = isFuture
    ? t('dayFuture')
    : rec ? t(rec.late ? 'daySheetLate' : 'daySheetTaken', { time: fmtTime(rec.at) })
          : t('daySheetNot');

  $('dayMark').textContent = t('dayMark');
  $('dayUnmark').textContent = t('dayUnmark');
  $('dayClose').textContent = t('dayClose');
  $('dayMark').hidden = !!rec || isFuture;
  $('dayUnmark').hidden = !rec;

  openSheet('daySheet');
}

/* ---------------------------------------------------------------
   Rendering — Settings
   --------------------------------------------------------------- */
function renderSettings() {
  const st = S.settings;

  $('settingsTitle').textContent = t('settingsTitle');
  $('lblLook').textContent = t('lblLook');
  $('lblLanguage').textContent = t('lblLanguage');
  $('lblPill').textContent = t('lblPill');
  $('lblPillName').textContent = t('lblPillName');
  $('pillName').placeholder = t('pillPlaceholder');
  $('lblRollover').textContent = t('lblRollover');
  $('hintRollover').textContent = t('hintRollover');
  $('lblReminders').textContent = t('lblReminders');
  $('addReminder').textContent = t('addReminder');
  $('exportIcs').textContent = t('exportIcs');
  $('hintIcs').textContent = t('hintIcs');
  $('lblRefill').textContent = t('lblRefill');
  $('lblRefillLeft').textContent = t('lblRefillLeft');
  $('lblRefillWarn').textContent = t('lblRefillWarn');
  $('refillReset').textContent = t('refillReset');
  $('lblBackup').textContent = t('lblBackup');
  $('hintBackup').textContent = t('hintBackup');
  $('backupBtn').textContent = t('backupBtn');
  $('restoreBtn').textContent = t('restoreBtn');
  $('about').textContent = t('about');

  document.querySelector('[data-theme-choice="soft"]').textContent = t('themeSoft');
  document.querySelector('[data-theme-choice="calm"]').textContent = t('themeCalm');
  for (const b of document.querySelectorAll('[data-theme-choice]'))
    b.setAttribute('aria-pressed', String(b.dataset.themeChoice === st.theme));
  for (const b of document.querySelectorAll('[data-lang-choice]'))
    b.setAttribute('aria-pressed', String(b.dataset.langChoice === st.lang));

  $('pillName').value = st.pillName;

  const sel = $('rollover');
  if (sel.options.length === 0) {
    for (let h = 0; h <= 6; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = `${pad(h)}:00`;
      sel.appendChild(o);
    }
  }
  sel.value = String(st.rolloverHour);

  $('remindersOn').checked = st.reminders.enabled;
  $('remindersBody').classList.toggle('disabled', !st.reminders.enabled);
  renderReminderList();
  renderPushNotice();

  $('refillOn').checked = st.refill.enabled;
  $('refillBody').classList.toggle('disabled', !st.refill.enabled);
  $('refillLeft').value = st.refill.left;
  $('refillWarn').value = st.refill.warnAt;
}

function dayLabels() {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 8, 1 + i);
    out.push(d.toLocaleDateString(T().locale, { weekday: 'short' }));
  }
  return out;
}

function describeDays(days) {
  if (days.length === 7) return t('everyDay');
  if (days.length === 0) return t('daysNone');
  const names = dayLabels();
  return days.slice().sort().map((d) => names[d]).join(', ');
}

function renderReminderList() {
  const ul = $('reminderList');
  ul.innerHTML = '';
  for (const it of S.settings.reminders.items) {
    const li = document.createElement('li');
    if (!it.days.length) li.classList.add('off');

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = it.time;

    const days = document.createElement('span');
    days.className = 'days';
    days.textContent = describeDays(it.days);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit';
    edit.textContent = t('editWord');
    edit.addEventListener('click', () => openReminderSheet(it));

    li.append(time, days, edit);
    ul.appendChild(li);
  }
}

function renderPushNotice() {
  const el = $('pushNotice');
  const r = S.settings.reminders;
  if (!r.enabled) { el.hidden = true; return; }

  if (!CONFIG.WORKER_URL) { el.hidden = false; el.textContent = t('pushNotSetUp'); return; }
  if (!isInstalled()) { el.hidden = false; el.innerHTML = t('pushNeedInstall'); return; }
  if (!('Notification' in window)) { el.hidden = true; return; }
  if (Notification.permission === 'denied') { el.hidden = false; el.textContent = t('pushBlocked'); return; }
  if (S.push.enabled) { el.hidden = false; el.textContent = t('pushOn'); return; }
  el.hidden = true;
}

/* ---------------------------------------------------------------
   Reminder edit sheet
   --------------------------------------------------------------- */
function openReminderSheet(item) {
  editingReminder = item || { id: rid(), time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], isNew: true };

  $('remSheetTitle').textContent = t(editingReminder.isNew ? 'remNewTitle' : 'remEditTitle');
  $('lblRemTime').textContent = t('lblRemTime');
  $('hintRemDays').textContent = t('hintRemDays');
  $('remSave').textContent = t('remSave');
  $('remDelete').textContent = t('remDelete');
  $('remCancel').textContent = t('remCancel');
  $('remDelete').hidden = !!editingReminder.isNew;
  $('remTime').value = editingReminder.time;

  const wrap = $('remDays');
  wrap.innerHTML = '';
  const names = dayLabels();
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = names[i].slice(0, 2);
    b.setAttribute('aria-pressed', String(editingReminder.days.includes(i)));
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!on));
    });
    wrap.appendChild(b);
  }

  openSheet('remSheet');
}

function saveReminderSheet() {
  const days = [];
  document.querySelectorAll('#remDays button').forEach((b, i) => {
    if (b.getAttribute('aria-pressed') === 'true') days.push(i);
  });

  const item = { id: editingReminder.id, time: $('remTime').value || '09:00', days };
  const items = S.settings.reminders.items;
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = item; else items.push(item);
  items.sort((a, b) => a.time.localeCompare(b.time));

  save();
  syncPush();
  closeSheets();
  renderAll();
}

/* ---------------------------------------------------------------
   Sheets
   --------------------------------------------------------------- */
function openSheet(id) {
  $('backdrop').hidden = false;
  $(id).hidden = false;
}
function closeSheets() {
  $('backdrop').hidden = true;
  $('daySheet').hidden = true;
  $('remSheet').hidden = true;
  sheetDayKey = null;
  editingReminder = null;
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------------------------------------------------------
   Push notifications
   --------------------------------------------------------------- */
function isInstalled() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches;
}

function urlB64ToUint8(base64) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enablePush() {
  if (!CONFIG.WORKER_URL) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (!isInstalled()) return false;

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(CONFIG.VAPID_PUBLIC_KEY)
      });
    }

    if (!S.push.subId) S.push.subId = rid() + rid();
    S.push.enabled = true;
    save();

    await postToWorker('/sub', { subscription: sub.toJSON() });
    return true;
  } catch (e) {
    console.warn('Push setup failed', e);
    S.push.enabled = false;
    save();
    return false;
  }
}

async function disablePush() {
  S.push.enabled = false;
  save();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { /* nothing useful to do */ }
  await postToWorker('/unsub', {});
}

/** Send the server the minimum it needs: the schedule, the timezone,
 *  and a single "stay quiet until" timestamp. No history, no name. */
async function syncPush() {
  if (!S.push.enabled || !S.push.subId) return;
  await postToWorker('/state', {});
}

async function postToWorker(path, extra) {
  if (!CONFIG.WORKER_URL || !S.push.subId) return null;
  try {
    const res = await fetch(CONFIG.WORKER_URL + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subId: S.push.subId,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        lang: S.settings.lang,
        enabled: S.settings.reminders.enabled,
        rolloverHour: S.settings.rolloverHour,
        items: S.settings.reminders.items,
        suppressUntil: isTaken(dayKeyOf()) ? nextRollover().toISOString() : null,
        ...extra
      })
    });
    return res.ok ? res.json() : null;
  } catch (e) {
    // Offline is normal and not an error worth surfacing — a missed sync
    // only ever means one extra reminder, never a missed one.
    return null;
  }
}

function updateBadge(taken) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (taken) navigator.clearAppBadge();
    else navigator.setAppBadge(1);
  } catch (e) { /* unsupported, no harm */ }
}

/* ---------------------------------------------------------------
   Calendar (.ics) export — the no-server reminder fallback
   --------------------------------------------------------------- */
const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function buildIcs() {
  const name = S.settings.pillName.trim();
  const title = name ? `🐘 ${name}` : (S.settings.lang === 'he' ? '🐘 הכדור היומי' : '🐘 Daily pill');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Elephant Reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'
  ];

  const start = new Date();
  for (const it of S.settings.reminders.items) {
    if (!it.days.length) continue;
    const [h, m] = it.time.split(':').map(Number);
    const dt = new Date(start);
    dt.setHours(h, m, 0, 0);
    const local = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(h)}${pad(m)}00`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:noapill-${it.id}@noaspill`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${local}`,
      `DURATION:PT5M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${it.days.map((d) => ICS_DAYS[d]).join(',')}`,
      `SUMMARY:${title}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function buildCsv() {
  const rows = [['date', 'taken', 'marked_at', 'added_later']];
  for (const key of Object.keys(S.log).sort()) {
    const r = S.log[key];
    rows.push([key, 'yes', r.at, r.late ? 'yes' : 'no']);
  }
  return rows.map((r) => r.join(',')).join('\n');
}

/** Uses the iOS share sheet when available (so she can send it straight
 *  to Calendar / Files), and falls back to a plain download. */
async function shareOrDownload(filename, mime, text) {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(t('copiedToast'));
}

/* ---------------------------------------------------------------
   Wiring
   --------------------------------------------------------------- */
function applyChrome() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.documentElement.lang = S.settings.lang;
  document.documentElement.dir = S.settings.lang === 'he' ? 'rtl' : 'ltr';
  $('appName').textContent = t('appName');
  $('tagline').textContent = t('tagline');
  $('tabToday').textContent = t('tabToday');
  $('tabHistory').textContent = t('tabHistory');
  $('tabSettings').textContent = t('tabSettings');
  $('installNudgeText').textContent = t('installNudge');
  $('installNudgeLink').textContent = t('installLink');
  $('installNudge').hidden = isInstalled();
}

function renderAll() {
  applyChrome();
  renderToday();
  renderHistory();
  renderSettings();
}

function showTab(name) {
  for (const v of ['today', 'history', 'settings']) $('view-' + v).hidden = (v !== name);
  for (const b of document.querySelectorAll('#tabs button'))
    b.classList.toggle('active', b.dataset.tab === name);
  window.scrollTo(0, 0);
}

function wire() {
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.addEventListener('click', () => showTab(b.dataset.tab)));

  // --- marking, with a 60s undo instead of a confirmation dialog ---
  $('markBtn').addEventListener('click', () => {
    markTaken(dayKeyOf(), false);
    $('hero').classList.add('celebrate');
    setTimeout(() => $('hero').classList.remove('celebrate'), 700);
    if (navigator.vibrate) navigator.vibrate(18);
    $('undoBar').hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { $('undoBar').hidden = true; }, UNDO_MS);
  });
  $('undoBtn').addEventListener('click', () => {
    clearTimeout(undoTimer);
    $('undoBar').hidden = true;
    unmark(dayKeyOf());
  });

  // --- history navigation ---
  $('prevMonth').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderHistory(); });
  $('nextMonth').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderHistory(); });
  $('exportCsv').addEventListener('click', () => shareOrDownload('elephant-history.csv', 'text/csv', buildCsv()));

  // --- day sheet ---
  $('dayMark').addEventListener('click', () => { markTaken(sheetDayKey, true); closeSheets(); });
  $('dayUnmark').addEventListener('click', () => { unmark(sheetDayKey); closeSheets(); });
  $('dayClose').addEventListener('click', closeSheets);
  $('backdrop').addEventListener('click', closeSheets);

  // --- appearance & language ---
  document.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.addEventListener('click', () => { S.settings.theme = b.dataset.themeChoice; save(); renderAll(); }));
  document.querySelectorAll('[data-lang-choice]').forEach((b) =>
    b.addEventListener('click', () => { S.settings.lang = b.dataset.langChoice; save(); syncPush(); renderAll(); }));

  // --- pill settings ---
  $('pillName').addEventListener('input', (e) => { S.settings.pillName = e.target.value; save(); renderToday(); });
  $('rollover').addEventListener('change', (e) => { S.settings.rolloverHour = Number(e.target.value); save(); syncPush(); renderAll(); });

  // --- reminders ---
  $('remindersOn').addEventListener('change', async (e) => {
    S.settings.reminders.enabled = e.target.checked;
    save();
    if (e.target.checked) {
      const ok = await enablePush();
      if (!ok && isInstalled() && CONFIG.WORKER_URL && Notification.permission === 'granted') toast(t('pushFailed'));
    } else {
      await disablePush();
    }
    await syncPush();
    renderAll();
  });
  $('addReminder').addEventListener('click', () => openReminderSheet(null));
  $('remSave').addEventListener('click', saveReminderSheet);
  $('remCancel').addEventListener('click', closeSheets);
  $('remDelete').addEventListener('click', () => {
    S.settings.reminders.items = S.settings.reminders.items.filter((x) => x.id !== editingReminder.id);
    save(); syncPush(); closeSheets(); renderAll();
  });
  $('exportIcs').addEventListener('click', () => shareOrDownload('elephant-reminders.ics', 'text/calendar', buildIcs()));

  // --- refill ---
  $('refillOn').addEventListener('change', (e) => { S.settings.refill.enabled = e.target.checked; save(); renderAll(); });
  $('refillLeft').addEventListener('change', (e) => { S.settings.refill.left = Math.max(0, Number(e.target.value) || 0); save(); renderAll(); });
  $('refillWarn').addEventListener('change', (e) => { S.settings.refill.warnAt = Math.max(0, Number(e.target.value) || 0); save(); renderAll(); });
  $('refillReset').addEventListener('click', () => {
    const n = prompt(t('refillAsk'), String(S.settings.refill.packSize || 28));
    if (n === null) return;
    const v = Math.max(0, parseInt(n, 10) || 0);
    S.settings.refill.packSize = v;
    S.settings.refill.left = v;
    S.settings.refill.lastDay = null;
    save(); renderAll();
  });

  // --- backup ---
  $('backupBtn').addEventListener('click', () => {
    const stamp = keyFromDate(new Date());
    shareOrDownload(`elephant-backup-${stamp}.json`, 'application/json', JSON.stringify(S, null, 2));
  });
  $('restoreBtn').addEventListener('click', () => $('restoreFile').click());
  $('restoreFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.log) throw new Error('shape');
      if (!confirm(t('restoreConfirm'))) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
      S = load();
      renderAll();
      toast(t('restoreDone'));
    } catch (err) {
      toast(t('restoreBad'));
    } finally {
      e.target.value = '';
    }
  });

  // The day can roll over while the app sits open in the background.
  let lastKey = dayKeyOf();
  const check = () => {
    const k = dayKeyOf();
    if (k !== lastKey) { lastKey = k; renderAll(); }
    else { renderNextReminder(); }
  };
  setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

/* ---------------------------------------------------------------
   Boot
   --------------------------------------------------------------- */
function boot() {
  // Language guess on very first run only.
  if (!localStorage.getItem(STORE_KEY)) {
    if ((navigator.language || '').toLowerCase().startsWith('he')) S.settings.lang = 'he';
    save();
  }

  wire();
  renderAll();
  showTab('today');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  }

  // Keep the server's copy of the schedule fresh whenever she opens the app.
  syncPush();
}

boot();
