/**
 * Pure logic for Stage 1 - Akademi BTC.
 *
 * Nothing in this file touches Google services (SpreadsheetApp, DriveApp, ...),
 * so it can be unit-tested with Node (see tests/logic.test.js).
 */

var FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'radio', 'checkbox', 'student', 'category', 'file'];

// Fields the dashboard depends on. Dev can relabel / move them, never delete them.
// Units are not asked: every report counts as one unit (a "units" number field, if a Dev adds one, overrides that).
var SYSTEM_FIELDS = {
  date: { type: 'date', label: 'Tanggal Pengerjaan' },
  student: { type: 'student', label: 'Nama Santri' },
  category: { type: 'category', label: 'Jenis Perangkat' }
};

// Bump when existing batches need their stored form changed; see migrateFormFields_.
var SCHEMA_VERSION = 2;

var PHOTO_FIELDS = [
  { key: 'photo_before', label: 'Sebelum bongkar' },
  { key: 'photo_after', label: 'Setelah bongkar' },
  { key: 'photo_supervisor', label: 'Foto bersama pengawas' }
];

var TABLE_HEADERS = {
  Settings: ['key', 'value', 'description'],
  Categories: ['key', 'label', 'defaultTarget', 'order', 'active'],
  Students: ['id', 'name', 'nickname', 'active', 'notes'],
  FormFields: ['key', 'label', 'type', 'options', 'required', 'order', 'section', 'help', 'active'],
  Milestones: ['day', 'units'],
  Reports: ['id', 'submittedAt', 'updatedAt', 'studentName']
};

var EDITABLE_TABLES = ['Settings', 'Categories', 'Students', 'FormFields', 'Milestones'];

function toBool_(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'ya' || s === '1' || s === 'y';
}

function toNum_(v, fallback) {
  if (fallback === undefined) fallback = 0;
  if (v === '' || v == null) return fallback;
  var n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

function slugKey_(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function settingKey_(s) {
  return String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9_]/g, '');
}

/** 'yyyy-MM-dd' -> days since epoch (UTC), or null. */
function dayNumber_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
}

function isoFromDayNumber_(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function splitOptions_(s) {
  return String(s == null ? '' : s).split(/\r?\n|;/).map(function (o) { return o.trim(); })
    .filter(function (o) { return o; });
}

function settingsToObject_(rows) {
  var out = {};
  (rows || []).forEach(function (r) { if (r.key) out[r.key] = r.value; });
  return out;
}

function sortByOrder_(rows) {
  return rows.slice().sort(function (a, b) { return toNum_(a.order, 9999) - toNum_(b.order, 9999); });
}

function activeCategories_(categories) {
  return sortByOrder_((categories || []).filter(function (c) { return c.key && toBool_(c.active); }));
}

function activeStudents_(students) {
  return (students || []).filter(function (s) { return s.id && s.name && toBool_(s.active); });
}

function activeFields_(fields) {
  return sortByOrder_((fields || []).filter(function (f) { return f.key && toBool_(f.active); }));
}

/** Expected cumulative units on `day`, linear between milestone points (day 0 = 0 units). */
function interpolateMilestone_(milestones, day) {
  var ms = (milestones || []).map(function (m) { return { day: toNum_(m.day), units: toNum_(m.units) }; })
    .filter(function (m) { return m.day > 0; })
    .sort(function (a, b) { return a.day - b.day; });
  if (!ms.length) return null;
  if (day <= 0) return 0;
  var prev = { day: 0, units: 0 };
  for (var i = 0; i < ms.length; i++) {
    var m = ms[i];
    if (day <= m.day) {
      return prev.units + (m.units - prev.units) * (day - prev.day) / (m.day - prev.day);
    }
    prev = m;
  }
  return ms[ms.length - 1].units;
}

function studentTarget_(student, cat) {
  var v = student['target:' + cat.key];
  return (v === '' || v == null) ? toNum_(cat.defaultTarget) : toNum_(v);
}

function pct_(done, target) {
  return target > 0 ? Math.round((done / target) * 1000) / 10 : null;
}

/** Match a report's student cell to a student (by id, falling back to name for hand-typed rows). */
function findStudent_(students, value) {
  var v = String(value == null ? '' : value).trim();
  if (!v) return null;
  var lower = v.toLowerCase();
  for (var i = 0; i < students.length; i++) if (String(students[i].id) === v) return students[i];
  for (var j = 0; j < students.length; j++) if (String(students[j].name).trim().toLowerCase() === lower) return students[j];
  return null;
}

function findCategory_(categories, value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  if (!v) return null;
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    if (String(c.key).toLowerCase() === v || String(c.label).trim().toLowerCase() === v) return c;
  }
  return null;
}

/**
 * Builds everything the dashboard shows.
 * input: { settings, categories, students, milestones, reports, today: 'yyyy-MM-dd' }
 */
function computeDashboard_(input) {
  var settings = input.settings || {};
  var cats = activeCategories_(input.categories);
  // Inactive students still appear if they have reports, so history is never hidden.
  var allStudents = (input.students || []).filter(function (s) { return s.id && s.name; });
  var reports = input.reports || [];
  var startDay = dayNumber_(settings.startDate);
  var todayDay = dayNumber_(input.today);
  var day = (startDay != null && todayDay != null) ? Math.max(0, todayDay - startDay + 1) : 0;
  var durationDays = toNum_(settings.durationDays, 30);
  var milestones = (input.milestones || []).map(function (m) { return { day: toNum_(m.day), units: toNum_(m.units) }; })
    .filter(function (m) { return m.day > 0; }).sort(function (a, b) { return a.day - b.day; });
  var lastMilestoneDay = milestones.length ? milestones[milestones.length - 1].day : 0;
  var seriesLen = Math.min(180, Math.max(day, durationDays, lastMilestoneDay, 1));
  var expected = interpolateMilestone_(milestones, day);

  var rowsById = {};
  var order = [];
  allStudents.forEach(function (s) {
    var r = {
      id: String(s.id), name: s.name, nickname: s.nickname || '', active: toBool_(s.active),
      done: {}, target: {}, ach: {}, totalDone: 0, totalTarget: 0, daily: []
    };
    for (var i = 0; i < seriesLen; i++) r.daily.push(0);
    cats.forEach(function (c) { r.done[c.key] = 0; r.target[c.key] = studentTarget_(s, c); r.totalTarget += r.target[c.key]; });
    rowsById[r.id] = r;
    order.push(r);
  });

  var unmatched = 0;
  var recent = [];
  reports.forEach(function (rep) {
    var s = findStudent_(allStudents, rep.student);
    var c = findCategory_(cats, rep.category);
    var units = toNum_(rep.units, 1);
    if (!s || !c) { unmatched++; return; }
    var row = rowsById[String(s.id)];
    row.done[c.key] += units;
    row.totalDone += units;
    var d = dayNumber_(rep.date);
    if (d == null) d = dayNumber_(rep.submittedAt);
    var idx = (d == null || startDay == null) ? seriesLen - 1 : d - startDay;
    idx = Math.max(0, Math.min(seriesLen - 1, idx));
    row.daily[idx] += units;
    recent.push({ id: rep.id, date: rep.date || String(rep.submittedAt || '').slice(0, 10), submittedAt: rep.submittedAt || '',
      studentId: row.id, studentName: row.name, category: c.label, units: units });
  });

  var students = order.filter(function (r) { return r.active || r.totalDone > 0; });
  var totals = { done: {}, target: {}, totalDone: 0, totalTarget: 0, onTrack: 0, behind: 0 };
  cats.forEach(function (c) { totals.done[c.key] = 0; totals.target[c.key] = 0; });

  students.forEach(function (r) {
    cats.forEach(function (c) {
      r.ach[c.key] = pct_(r.done[c.key], r.target[c.key]);
      totals.done[c.key] += r.done[c.key];
      totals.target[c.key] += r.target[c.key];
    });
    r.pct = pct_(r.totalDone, r.totalTarget);
    r.expected = expected == null ? null : Math.round(expected * 10) / 10;
    r.status = expected == null ? 'none' : (r.totalDone >= expected ? 'on-track' : 'behind');
    if (r.status === 'on-track') totals.onTrack++;
    if (r.status === 'behind') totals.behind++;
    var cum = 0;
    r.cumulative = r.daily.map(function (u) { cum += u; return cum; });
    delete r.daily;
    totals.totalDone += r.totalDone;
    totals.totalTarget += r.totalTarget;
  });
  totals.pct = pct_(totals.totalDone, totals.totalTarget);
  totals.ach = {};
  cats.forEach(function (c) { totals.ach[c.key] = pct_(totals.done[c.key], totals.target[c.key]); });

  var plan = [];
  for (var i = 1; i <= seriesLen; i++) {
    var e = interpolateMilestone_(milestones, i);
    plan.push(e == null ? null : Math.round(e * 10) / 10);
  }

  recent.sort(function (a, b) { return String(b.submittedAt || b.date).localeCompare(String(a.submittedAt || a.date)); });

  return {
    batchName: settings.batchName || '',
    stageName: settings.stageName || '',
    title: settings.dashboardTitle || 'Dashboard Santri',
    notice: settings.dashboardNotice || '',
    showRecent: settings.showRecentReports === undefined ? true : toBool_(settings.showRecentReports),
    startDate: settings.startDate || '',
    today: input.today,
    day: day,
    durationDays: durationDays,
    expectedToday: expected == null ? null : Math.round(expected * 10) / 10,
    categories: cats.map(function (c) { return { key: c.key, label: c.label }; }),
    milestones: milestones,
    students: students,
    totals: totals,
    plan: plan,
    seriesLen: seriesLen,
    recent: recent.slice(0, 50),
    unmatchedReports: unmatched
  };
}

/**
 * Validates a guest submission against the form definition.
 * Returns { values: {key: cellValue}, files: [fieldKey], errors: [msg], studentName }.
 * File fields are only checked for presence; Code.gs saves them to Drive.
 */
function validateReport_(fields, answers, students, categories) {
  answers = answers || {};
  var values = {}, errors = [], files = [], studentName = '';
  var stud = activeStudents_(students);
  var cats = activeCategories_(categories);
  activeFields_(fields).forEach(function (f) {
    var v = answers[f.key];
    var required = toBool_(f.required);
    var label = f.label || f.key;
    if (f.type === 'file') {
      var has = v && v.data;
      if (required && !has) errors.push(label + ' wajib diisi.');
      if (has) files.push(f.key);
      return;
    }
    if (f.type === 'checkbox') {
      var arr = Array.isArray(v) ? v : (v ? [v] : []);
      var opts = splitOptions_(f.options);
      arr = arr.map(String).filter(function (x) { return opts.indexOf(x) >= 0; });
      if (required && !arr.length) errors.push(label + ' wajib diisi.');
      values[f.key] = arr.join(', ');
      return;
    }
    var s = String(v == null ? '' : v).trim();
    if (!s) {
      if (required) errors.push(label + ' wajib diisi.');
      values[f.key] = '';
      return;
    }
    switch (f.type) {
      case 'number':
        var n = Number(s.replace(',', '.'));
        if (isNaN(n) || n < 0) errors.push(label + ' harus berupa angka >= 0.');
        else values[f.key] = n;
        break;
      case 'date':
        if (dayNumber_(s) == null) errors.push(label + ' tidak valid.');
        else values[f.key] = s.slice(0, 10);
        break;
      case 'select':
      case 'radio':
        if (splitOptions_(f.options).indexOf(s) < 0) errors.push(label + ': pilihan tidak valid.');
        else values[f.key] = s;
        break;
      case 'student':
        var st = null;
        for (var i = 0; i < stud.length; i++) if (String(stud[i].id) === s) st = stud[i];
        if (!st) errors.push(label + ': santri tidak ditemukan.');
        else { values[f.key] = st.id; if (f.key === 'student') studentName = st.name; }
        break;
      case 'category':
        var ct = null;
        for (var j = 0; j < cats.length; j++) if (String(cats[j].key) === s) ct = cats[j];
        if (!ct) errors.push(label + ': kategori tidak ditemukan.');
        else values[f.key] = ct.key;
        break;
      default:
        values[f.key] = s.slice(0, 5000);
    }
  });
  return { values: values, files: files, errors: errors, studentName: studentName };
}

/**
 * Cleans a table the Dev panel sends back before it is written to the sheet.
 * ctx: { categories } (current categories, used for student target columns)
 * Returns { headers, rows }.
 */
function sanitizeTable_(name, rows, ctx) {
  rows = (rows || []).filter(function (r) { return r && typeof r === 'object'; });
  ctx = ctx || {};
  var headers = TABLE_HEADERS[name].slice();
  var out = [];
  var seen = {};
  function uniqueKey(base, fallback) {
    var k = base || fallback, n = 2, b = k;
    while (seen[k]) k = b + '_' + (n++);
    seen[k] = true;
    return k;
  }

  if (name === 'Settings') {
    rows.forEach(function (r) {
      var k = settingKey_(r.key);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push({ key: k, value: r.value == null ? '' : String(r.value), description: r.description || '' });
    });
  } else if (name === 'Categories') {
    rows.forEach(function (r, i) {
      var label = String(r.label || r.key || '').trim();
      if (!label) return;
      out.push({ key: uniqueKey(slugKey_(r.key || label), 'cat'), label: label,
        defaultTarget: toNum_(r.defaultTarget), order: i + 1, active: r.active === undefined ? true : toBool_(r.active) });
    });
    if (!out.length) throw new Error('Minimal harus ada 1 kategori.');
  } else if (name === 'Students') {
    var cats = activeCategories_(ctx.categories);
    cats.forEach(function (c) { headers.push('target:' + c.key); });
    var maxNum = 0;
    rows.forEach(function (r) { var m = /^S(\d+)$/.exec(String(r.id || '')); if (m) maxNum = Math.max(maxNum, +m[1]); });
    rows.forEach(function (r) {
      var nm = String(r.name || '').trim();
      if (!nm) return;
      var id = String(r.id || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
      if (!id || seen[id]) id = 'S' + ('000' + (++maxNum)).slice(-3);
      seen[id] = true;
      var row = { id: id, name: nm, nickname: String(r.nickname || '').trim(),
        active: r.active === undefined ? true : toBool_(r.active), notes: r.notes || '' };
      cats.forEach(function (c) {
        var v = r['target:' + c.key];
        row['target:' + c.key] = (v === '' || v == null) ? '' : toNum_(v);
      });
      out.push(row);
    });
  } else if (name === 'FormFields') {
    rows.forEach(function (r) {
      var label = String(r.label || '').trim();
      var key = slugKey_(r.key || label);
      if (!key) return;
      if (SYSTEM_FIELDS[key]) {
        if (seen[key]) return;
        seen[key] = true;
      } else {
        key = uniqueKey(key, 'field');
      }
      var sys = SYSTEM_FIELDS[key];
      var type = sys ? sys.type : (FIELD_TYPES.indexOf(r.type) >= 0 ? r.type : 'text');
      out.push({ key: key, label: label || (sys ? sys.label : key), type: type,
        options: splitOptions_(r.options).join('\n'),
        required: r.required === undefined ? !!sys : toBool_(r.required),
        order: 0, section: String(r.section || '').trim(), help: r.help || '',
        // The dashboard cannot count a report without student and category, so those stay on.
        active: (sys && key !== 'date') || r.active === undefined ? true : toBool_(r.active) });
    });
    Object.keys(SYSTEM_FIELDS).forEach(function (k) {
      if (!seen[k]) out.push({ key: k, label: SYSTEM_FIELDS[k].label, type: SYSTEM_FIELDS[k].type, options: '',
        required: true, order: 0, section: '', help: '', active: true });
    });
    out.forEach(function (r, i) { r.order = i + 1; });
  } else if (name === 'Milestones') {
    rows.forEach(function (r) {
      var d = toNum_(r.day), u = toNum_(r.units);
      if (d > 0 && !seen[d]) { seen[d] = true; out.push({ day: d, units: Math.max(0, u) }); }
    });
    out.sort(function (a, b) { return a.day - b.day; });
  } else {
    throw new Error('Tabel tidak bisa diedit: ' + name);
  }
  return { headers: headers, rows: out };
}

function photoFieldRows_() {
  return PHOTO_FIELDS.map(function (p, i) {
    return { key: p.key, label: p.label, type: 'file', options: '', required: false, order: 100 + i, section: 'Foto Bukti',
      help: 'Foto atau video', active: true };
  });
}

/**
 * Upgrades a batch's stored form questions from schema `fromVersion` to SCHEMA_VERSION.
 * v2: the "units" question is dropped (each report = 1 unit) and the single "photo" upload is
 * replaced by three photo uploads in a "Foto Bukti" section. Answers already in Reports stay.
 */
function migrateFormFields_(fields, fromVersion) {
  var out = (fields || []).slice();
  if (fromVersion < 2) {
    out = out.filter(function (f) { return f.key !== 'units' && f.key !== 'photo'; });
    var have = {};
    out.forEach(function (f) { have[f.key] = true; });
    photoFieldRows_().forEach(function (f) { if (!have[f.key]) out.push(f); });
  }
  return out;
}

/** Starting content for a brand-new batch (used for Batch 4 and when no source batch is copied). */
function defaultBatchTables_(batchName, startDate) {
  return {
    Settings: [
      { key: 'batchName', value: batchName, description: 'Nama batch yang tampil di aplikasi' },
      { key: 'stageName', value: 'Stage 1 - Akademi', description: 'Nama stage' },
      { key: 'startDate', value: startDate, description: 'Hari pertama Stage 1 (yyyy-MM-dd)' },
      { key: 'durationDays', value: '30', description: 'Lama stage (hari)' },
      { key: 'formTitle', value: 'Laporan Harian Stage 1 - Akademi BTC', description: 'Judul form' },
      { key: 'formDescription', value: 'Isi laporan setiap selesai mengerjakan unit.', description: 'Keterangan di bawah judul form' },
      { key: 'formOpen', value: 'true', description: 'true = form bisa diisi, false = form ditutup' },
      { key: 'successMessage', value: 'Terima kasih, laporan tersimpan.', description: 'Pesan setelah submit' },
      { key: 'dashboardTitle', value: 'Dashboard Santri', description: 'Judul dashboard' },
      { key: 'dashboardNotice', value: '', description: 'Pengumuman di atas dashboard (opsional)' },
      { key: 'showRecentReports', value: 'true', description: 'Tampilkan riwayat laporan di dashboard' },
      { key: 'bannerFileId', value: '', description: 'File banner di Drive (diatur dari tab Pengaturan > Banner)' },
      { key: 'schemaVersion', value: String(SCHEMA_VERSION), description: 'Versi struktur data (jangan diubah)' }
    ],
    Categories: [
      { key: 'android', label: 'Android', defaultTarget: 60, order: 1, active: true },
      { key: 'iphone', label: 'iPhone', defaultTarget: 20, order: 2, active: true },
      { key: 'laptop', label: 'Laptop', defaultTarget: 20, order: 3, active: true }
    ],
    Students: [],
    FormFields: [
      { key: 'date', label: 'Tanggal Pengerjaan', type: 'date', options: '', required: true, order: 1, section: 'Data Laporan', help: '', active: true },
      { key: 'student', label: 'Nama Santri', type: 'student', options: '', required: true, order: 2, section: 'Data Laporan', help: '', active: true },
      { key: 'category', label: 'Jenis Perangkat', type: 'category', options: '', required: true, order: 3, section: 'Data Laporan', help: '', active: true },
      { key: 'device_model', label: 'Merk / Tipe Perangkat', type: 'text', options: '', required: false, order: 5, section: 'Detail Pekerjaan', help: 'Contoh: Samsung A12, iPhone 11, Lenovo T480', active: true },
      { key: 'work_type', label: 'Jenis Pekerjaan', type: 'checkbox', options: 'Diagnosa\nGanti LCD\nGanti Baterai\nGanti Konektor Cas\nSoftware / Flashing\nLainnya', required: false, order: 6, section: 'Detail Pekerjaan', help: '', active: true },
      { key: 'notes', label: 'Catatan / Kendala', type: 'textarea', options: '', required: false, order: 7, section: 'Detail Pekerjaan', help: '', active: true },
    ].concat(photoFieldRows_()),
    Milestones: [
      { day: 5, units: 13 }, { day: 10, units: 25 }, { day: 15, units: 38 }, { day: 20, units: 50 },
      { day: 25, units: 63 }, { day: 30, units: 75 }, { day: 35, units: 88 }, { day: 40, units: 100 }
    ]
  };
}

// Node test hook; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = {
    toBool_: toBool_, toNum_: toNum_, slugKey_: slugKey_, dayNumber_: dayNumber_, interpolateMilestone_: interpolateMilestone_,
    computeDashboard_: computeDashboard_, validateReport_: validateReport_, sanitizeTable_: sanitizeTable_,
    defaultBatchTables_: defaultBatchTables_, migrateFormFields_: migrateFormFields_, SCHEMA_VERSION: SCHEMA_VERSION, settingsToObject_: settingsToObject_, SYSTEM_FIELDS: SYSTEM_FIELDS
  };
}
