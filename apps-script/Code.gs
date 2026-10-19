/**
 * Stage 1 - Akademi BTC: web app entry point, Drive/Sheets storage, and the
 * functions the Guest and Dev pages call through google.script.run.
 *
 * Storage layout (inside the root folder chosen by the developer):
 *   <root>/Akademi BTC Stage 1 - Registry      list of batches
 *   <root>/Stage 1 - Akademi BTC - Batch 4/     one folder per batch
 *       ... - Data   (spreadsheet: Settings, Categories, Students, FormFields, Milestones, Reports)
 *       Uploads/     (photos attached to reports)
 * Every batch has its own spreadsheet, so a new batch never touches an older one.
 */

var APP_NAME = 'Stage 1 - Akademi BTC';
var DEFAULT_ROOT_FOLDER_NAME = 'Akademi BTC - Stage 1';
var REGISTRY_FILE_NAME = 'Akademi BTC Stage 1 - Registry';
var REGISTRY_HEADERS = ['id', 'name', 'spreadsheetId', 'folderId', 'status', 'isDefault', 'createdAt'];
var DEV_SESSION_SECONDS = 6 * 60 * 60;
var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------- web app

function doGet(e) {
  var p = (e && e.parameter) || {};
  var page = p.mode === 'dev' ? 'Dev' : 'Index';
  if (!props_().getProperty('SETUP_DONE')) page = 'Setup';
  var t = template_(page);
  t.isOwner = page === 'Setup' && isOwner_();
  t.initialBatch = String(p.batch || '').replace(/[^A-Za-z0-9_-]/g, '');
  t.initialView = p.view === 'dashboard' ? 'dashboard' : 'form';
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// The single-file build (dist/Code.gs) defines HTML_FILES; the multi-file project uses real HTML files.
function template_(name) {
  return typeof HTML_FILES !== 'undefined'
    ? HtmlService.createTemplate(HTML_FILES[name]) : HtmlService.createTemplateFromFile(name);
}

function include(name) {
  return typeof HTML_FILES !== 'undefined'
    ? HTML_FILES[name] : HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** True when the visitor is the account the web app runs as (anonymous visitors have no email). */
function isOwner_() {
  var active = Session.getActiveUser().getEmail();
  return !!active && active === Session.getEffectiveUser().getEmail();
}

// ---------------------------------------------------------------- helpers

function props_() { return PropertiesService.getScriptProperties(); }

function tz_() { return Session.getScriptTimeZone() || 'Asia/Jakarta'; }

function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function getRootFolder_() {
  var id = props_().getProperty('ROOT_FOLDER_ID');
  if (!id) throw new Error('Aplikasi belum di-setup. Developer perlu menjalankan setup() di editor Apps Script.');
  return DriveApp.getFolderById(id);
}

function getRegistrySheet_() {
  var id = props_().getProperty('REGISTRY_ID');
  if (!id) throw new Error('Aplikasi belum di-setup. Developer perlu menjalankan setup() di editor Apps Script.');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('Batches');
  if (!sh) {
    sh = ss.insertSheet('Batches');
    sh.getRange(1, 1, 1, REGISTRY_HEADERS.length).setValues([REGISTRY_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function normalizeCell_(v) {
  if (v instanceof Date) {
    var hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, tz_(), hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  return v;
}

function getOrCreateSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var h = TABLE_HEADERS[name] || ['id'];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Reads a sheet as { headers, rows: [{header: value}] } with dates as strings. */
function readTable_(ss, name) {
  var sh = getOrCreateSheet_(ss, name);
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r.every(function (c) { return c === '' || c == null; })) continue;
    var o = {};
    headers.forEach(function (h, j) { if (h) o[h] = normalizeCell_(r[j]); });
    rows.push(o);
  }
  return { headers: headers.filter(function (h) { return h; }), rows: rows };
}

/** Replaces a whole sheet. Cells are stored as plain text so dates/ids never get auto-converted. */
function writeTable_(ss, name, headers, rows) {
  var sh = getOrCreateSheet_(ss, name);
  sh.clearContents();
  var data = [headers].concat(rows.map(function (r) {
    return headers.map(function (h) { return r[h] == null ? '' : String(r[h]); });
  }));
  sh.getRange(1, 1, data.length, headers.length).setNumberFormat('@').setValues(data);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

/** Adds any missing columns to the end of the header row (never removes, so old data is kept). */
function ensureHeaders_(sh, needed) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  if (current.length === 1 && !current[0]) current = [];
  var missing = needed.filter(function (h) { return current.indexOf(h) < 0; });
  if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    current = current.concat(missing);
  }
  sh.setFrozenRows(1);
  return current;
}

function reportHeaders_(fields) {
  return TABLE_HEADERS.Reports.concat((fields || []).map(function (f) { return f.key; }));
}

function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---------------------------------------------------------------- batches

function listBatches_() {
  var sh = getRegistrySheet_();
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(String);
  return values.slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = normalizeCell_(r[i]); });
    o.id = String(o.id);
    o.isDefault = toBool_(o.isDefault);
    o.status = o.status || 'active';
    return o;
  });
}

function saveBatches_(list) {
  var sh = getRegistrySheet_();
  sh.clearContents();
  var data = [REGISTRY_HEADERS].concat(list.map(function (b) {
    return REGISTRY_HEADERS.map(function (h) { return b[h] == null ? '' : String(b[h]); });
  }));
  sh.getRange(1, 1, data.length, REGISTRY_HEADERS.length).setNumberFormat('@').setValues(data);
  sh.getRange(1, 1, 1, REGISTRY_HEADERS.length).setFontWeight('bold');
}

function resolveBatch_(batchId) {
  var list = listBatches_();
  if (!list.length) throw new Error('Belum ada batch. Developer perlu menjalankan setup().');
  if (batchId) {
    for (var i = 0; i < list.length; i++) if (list[i].id === String(batchId)) return list[i];
  }
  for (var j = 0; j < list.length; j++) if (list[j].isDefault) return list[j];
  for (var k = 0; k < list.length; k++) if (list[k].status !== 'archived') return list[k];
  return list[0];
}

function publicBatchList_() {
  return listBatches_().map(function (b) {
    return { id: b.id, name: b.name, status: b.status, isDefault: b.isDefault };
  });
}

function loadBatchData_(ss) {
  var settingsRows = readTable_(ss, 'Settings').rows;
  return {
    settingsRows: settingsRows,
    settings: settingsToObject_(settingsRows),
    categories: readTable_(ss, 'Categories').rows,
    students: readTable_(ss, 'Students').rows,
    fields: readTable_(ss, 'FormFields').rows,
    milestones: readTable_(ss, 'Milestones').rows
  };
}

/**
 * Creates a new, isolated batch: own folder, own spreadsheet, empty Reports.
 * opts: { name, startDate, sourceBatchId, copyStudents }
 */
function createBatch_(opts) {
  var name = String(opts.name || '').trim();
  if (!name) throw new Error('Nama batch wajib diisi.');
  var startDate = String(opts.startDate || today_()).slice(0, 10);
  if (dayNumber_(startDate) == null) throw new Error('Tanggal mulai tidak valid.');

  var list = listBatches_();
  var base = slugKey_(name).replace(/_/g, '-') || 'batch';
  var id = base, n = 2;
  while (list.some(function (b) { return b.id === id; })) id = base + '-' + (n++);

  var tables;
  if (opts.sourceBatchId) {
    var src = resolveBatch_(opts.sourceBatchId);
    var srcData = loadBatchData_(SpreadsheetApp.openById(src.spreadsheetId));
    tables = {
      Settings: srcData.settingsRows,
      Categories: srcData.categories,
      Students: opts.copyStudents ? srcData.students : [],
      FormFields: srcData.fields,
      Milestones: srcData.milestones
    };
  } else {
    tables = defaultBatchTables_(name, startDate);
  }
  // Batch-specific settings always come from the new batch, never from the copy source.
  tables.Settings = tables.Settings.filter(function (r) { return r.key !== 'batchName' && r.key !== 'startDate'; });
  tables.Settings.unshift(
    { key: 'batchName', value: name, description: 'Nama batch yang tampil di aplikasi' },
    { key: 'startDate', value: startDate, description: 'Hari pertama Stage 1 (yyyy-MM-dd)' });

  var root = getRootFolder_();
  var folder = root.createFolder(APP_NAME + ' - ' + name);
  var ss = SpreadsheetApp.create(APP_NAME + ' - ' + name + ' - Data');
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  getOrCreateSubfolder_(folder, 'Uploads');

  var categories = sanitizeTable_('Categories', tables.Categories, {});
  writeTable_(ss, 'Settings', TABLE_HEADERS.Settings, sanitizeTable_('Settings', tables.Settings, {}).rows);
  writeTable_(ss, 'Categories', categories.headers, categories.rows);
  var students = sanitizeTable_('Students', tables.Students, { categories: categories.rows });
  writeTable_(ss, 'Students', students.headers, students.rows);
  var fields = sanitizeTable_('FormFields', tables.FormFields, {});
  writeTable_(ss, 'FormFields', fields.headers, fields.rows);
  var ms = sanitizeTable_('Milestones', tables.Milestones, {});
  writeTable_(ss, 'Milestones', ms.headers, ms.rows);
  writeTable_(ss, 'Reports', reportHeaders_(fields.rows), []);
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  var meta = {
    id: id, name: name, spreadsheetId: ss.getId(), folderId: folder.getId(),
    status: 'active', isDefault: !list.some(function (b) { return b.isDefault; }), createdAt: now_()
  };
  list.push(meta);
  saveBatches_(list);
  return meta;
}

// ---------------------------------------------------------------- guest API

function apiGetPublic(batchId) {
  var meta = resolveBatch_(batchId);
  var data = loadBatchData_(SpreadsheetApp.openById(meta.spreadsheetId));
  var s = data.settings;
  return {
    batches: publicBatchList_(),
    batch: { id: meta.id, name: meta.name, status: meta.status },
    settings: {
      batchName: s.batchName || meta.name, stageName: s.stageName || '', formTitle: s.formTitle || APP_NAME,
      formDescription: s.formDescription || '', successMessage: s.successMessage || 'Terima kasih, laporan tersimpan.',
      formOpen: meta.status !== 'archived' && (s.formOpen === undefined ? true : toBool_(s.formOpen)),
      dashboardTitle: s.dashboardTitle || 'Dashboard Santri'
    },
    fields: activeFields_(data.fields).map(function (f) {
      return { key: f.key, label: f.label, type: f.type, options: splitOptions_(f.options),
        required: toBool_(f.required), section: f.section || '', help: f.help || '' };
    }),
    categories: activeCategories_(data.categories).map(function (c) { return { key: c.key, label: c.label }; }),
    students: activeStudents_(data.students).map(function (st) { return { id: String(st.id), name: st.name, nickname: st.nickname || '' }; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }),
    today: today_()
  };
}

function apiSubmitReport(batchId, answers) {
  var meta = resolveBatch_(batchId);
  if (meta.status === 'archived') throw new Error('Batch ini sudah ditutup.');
  var ss = SpreadsheetApp.openById(meta.spreadsheetId);
  var data = loadBatchData_(ss);
  if (data.settings.formOpen !== undefined && !toBool_(data.settings.formOpen)) throw new Error('Form sedang ditutup.');
  var result = validateReport_(data.fields, answers, data.students, data.categories);
  if (result.errors.length) throw new Error(result.errors.join('\n'));

  result.files.forEach(function (key) {
    result.values[key] = saveUpload_(meta, answers[key], result.studentName);
  });

  return withLock_(function () {
    var sh = getOrCreateSheet_(ss, 'Reports');
    var headers = ensureHeaders_(sh, reportHeaders_(activeFields_(data.fields)));
    var row = result.values;
    row.id = Utilities.getUuid().slice(0, 13);
    row.submittedAt = now_();
    row.updatedAt = '';
    row.studentName = result.studentName;
    var line = headers.map(function (h) { return row[h] == null ? '' : String(row[h]); });
    sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setNumberFormat('@').setValues([line]);
    return { ok: true, id: row.id };
  });
}

function saveUpload_(meta, file, studentName) {
  if (!file || !file.data) return '';
  var bytes = Utilities.base64Decode(String(file.data));
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('File terlalu besar (maks 10 MB).');
  var folder = getOrCreateSubfolder_(DriveApp.getFolderById(meta.folderId), 'Uploads');
  var name = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss') + ' ' + (studentName || '') + ' ' + String(file.name || 'upload');
  var blob = Utilities.newBlob(bytes, String(file.mimeType || 'application/octet-stream'), name.trim());
  return folder.createFile(blob).getUrl();
}

function apiGetDashboard(batchId) {
  var meta = resolveBatch_(batchId);
  var ss = SpreadsheetApp.openById(meta.spreadsheetId);
  var data = loadBatchData_(ss);
  var dash = computeDashboard_({
    settings: data.settings, categories: data.categories, students: data.students,
    milestones: data.milestones, reports: readTable_(ss, 'Reports').rows, today: today_()
  });
  dash.batch = { id: meta.id, name: meta.name, status: meta.status };
  dash.batches = publicBatchList_();
  if (!dash.batchName) dash.batchName = meta.name;
  return dash;
}

// ---------------------------------------------------------------- dev API

function hashPassword_(pw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    ScriptApp.getScriptId() + '|' + pw, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function setDevPasswordHash_(pw) {
  if (String(pw || '').length < 6) throw new Error('Password minimal 6 karakter.');
  props_().setProperty('DEV_PASSWORD_HASH', hashPassword_(String(pw)));
}

function requireDev_(token) {
  if (!token || !CacheService.getScriptCache().get('dev:' + token)) throw new Error('SESSION_EXPIRED');
}

function apiDevLogin(password) {
  var hash = props_().getProperty('DEV_PASSWORD_HASH');
  if (!hash) throw new Error('Password Dev belum dibuat. Jalankan setup() di editor Apps Script.');
  if (hashPassword_(String(password || '')) !== hash) {
    Utilities.sleep(1000);
    throw new Error('Password salah.');
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('dev:' + token, '1', DEV_SESSION_SECONDS);
  return token;
}

function apiDevLogout(token) {
  if (token) CacheService.getScriptCache().remove('dev:' + token);
  return true;
}

function apiDevChangePassword(token, newPassword) {
  requireDev_(token);
  setDevPasswordHash_(newPassword);
  return true;
}

function apiDevGetAll(token, batchId) {
  requireDev_(token);
  var meta = resolveBatch_(batchId);
  var ss = SpreadsheetApp.openById(meta.spreadsheetId);
  var tables = {};
  EDITABLE_TABLES.concat(['Reports']).forEach(function (n) { tables[n] = readTable_(ss, n); });
  return {
    batches: listBatches_(),
    batch: meta,
    tables: tables,
    today: today_(),
    urls: {
      spreadsheet: ss.getUrl(),
      folder: DriveApp.getFolderById(meta.folderId).getUrl(),
      root: getRootFolder_().getUrl(),
      registry: SpreadsheetApp.openById(props_().getProperty('REGISTRY_ID')).getUrl(),
      app: ScriptApp.getService().getUrl()
    }
  };
}

function apiDevSaveTable(token, batchId, name, rows) {
  requireDev_(token);
  if (EDITABLE_TABLES.indexOf(name) < 0) throw new Error('Tabel tidak bisa diedit: ' + name);
  var meta = resolveBatch_(batchId);
  withLock_(function () {
    var ss = SpreadsheetApp.openById(meta.spreadsheetId);
    var ctx = { categories: readTable_(ss, 'Categories').rows };
    var clean = sanitizeTable_(name, rows, ctx);
    writeTable_(ss, name, clean.headers, clean.rows);
    if (name === 'Categories') {
      // Keep the student target columns in step with the categories.
      var st = sanitizeTable_('Students', readTable_(ss, 'Students').rows, { categories: clean.rows });
      writeTable_(ss, 'Students', st.headers, st.rows);
    }
    if (name === 'FormFields') ensureHeaders_(getOrCreateSheet_(ss, 'Reports'), reportHeaders_(clean.rows));
    if (name === 'Settings') {
      var s = settingsToObject_(clean.rows);
      if (s.batchName && s.batchName !== meta.name) {
        var list = listBatches_();
        list.forEach(function (b) { if (b.id === meta.id) b.name = s.batchName; });
        saveBatches_(list);
      }
    }
  });
  return apiDevGetAll(token, meta.id);
}

/** Inserts (no id) or updates (id) one report row. Dev edits skip guest validation on purpose. */
function apiDevSaveReport(token, batchId, row) {
  requireDev_(token);
  var meta = resolveBatch_(batchId);
  withLock_(function () {
    var ss = SpreadsheetApp.openById(meta.spreadsheetId);
    var fields = readTable_(ss, 'FormFields').rows;
    var students = readTable_(ss, 'Students').rows;
    var sh = getOrCreateSheet_(ss, 'Reports');
    var headers = ensureHeaders_(sh, reportHeaders_(fields));
    var st = findStudent_(students, row.student);
    if (st) row.studentName = st.name;
    var values = sh.getDataRange().getValues();
    var idCol = headers.indexOf('id');
    var rowIndex = -1;
    if (row.id) {
      for (var i = 1; i < values.length; i++) if (String(values[i][idCol]) === String(row.id)) { rowIndex = i + 1; break; }
      if (rowIndex < 0) throw new Error('Laporan tidak ditemukan: ' + row.id);
      var existing = values[rowIndex - 1];
      var merged = headers.map(function (h, j) {
        if (h === 'id' || h === 'submittedAt') return String(normalizeCell_(existing[j]));
        if (h === 'updatedAt') return now_();
        return row[h] === undefined ? String(normalizeCell_(existing[j])) : String(row[h] == null ? '' : row[h]);
      });
      sh.getRange(rowIndex, 1, 1, headers.length).setNumberFormat('@').setValues([merged]);
    } else {
      row.id = Utilities.getUuid().slice(0, 13);
      row.submittedAt = now_();
      row.updatedAt = '';
      var line = headers.map(function (h) { return row[h] == null ? '' : String(row[h]); });
      sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setNumberFormat('@').setValues([line]);
    }
  });
  return apiDevGetAll(token, meta.id);
}

function apiDevDeleteReport(token, batchId, id) {
  requireDev_(token);
  var meta = resolveBatch_(batchId);
  withLock_(function () {
    var sh = getOrCreateSheet_(SpreadsheetApp.openById(meta.spreadsheetId), 'Reports');
    var values = sh.getDataRange().getValues();
    var idCol = values[0].map(String).indexOf('id');
    for (var i = values.length - 1; i >= 1; i--) {
      if (String(values[i][idCol]) === String(id)) { sh.deleteRow(i + 1); return; }
    }
    throw new Error('Laporan tidak ditemukan: ' + id);
  });
  return apiDevGetAll(token, meta.id);
}

function apiDevCreateBatch(token, opts) {
  requireDev_(token);
  var meta = withLock_(function () { return createBatch_(opts || {}); });
  return apiDevGetAll(token, meta.id);
}

/** patch: { name?, status?: 'active'|'archived', isDefault?: true } */
function apiDevUpdateBatch(token, batchId, patch) {
  requireDev_(token);
  patch = patch || {};
  withLock_(function () {
    var list = listBatches_();
    var target = null;
    list.forEach(function (b) { if (b.id === String(batchId)) target = b; });
    if (!target) throw new Error('Batch tidak ditemukan.');
    if (patch.name && String(patch.name).trim()) target.name = String(patch.name).trim();
    if (patch.status === 'active' || patch.status === 'archived') target.status = patch.status;
    if (patch.isDefault) list.forEach(function (b) { b.isDefault = b.id === target.id; });
    saveBatches_(list);
    if (patch.name) {
      var ss = SpreadsheetApp.openById(target.spreadsheetId);
      var rows = readTable_(ss, 'Settings').rows;
      var found = false;
      rows.forEach(function (r) { if (r.key === 'batchName') { r.value = target.name; found = true; } });
      if (!found) rows.unshift({ key: 'batchName', value: target.name, description: 'Nama batch yang tampil di aplikasi' });
      writeTable_(ss, 'Settings', TABLE_HEADERS.Settings, rows);
    }
  });
  return apiDevGetAll(token, batchId);
}

function apiAppUrl() {
  return ScriptApp.getService().getUrl();
}
