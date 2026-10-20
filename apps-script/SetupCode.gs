/**
 * One-time setup. Easiest way: deploy the web app, then open it while signed in as the
 * owner account (hrd.madinah.reload@gmail.com); it shows a setup form the first time.
 *
 * Alternative from the editor: fill in SETUP below, choose `setup` in the function picker
 * and press Run. Running it again is safe: it only creates what is missing.
 */
var SETUP = {
  // Drive folder for all app data: its ID or URL. Empty = create "Akademi BTC - Stage 1" in My Drive.
  ROOT_FOLDER_ID: '',
  // Password for the Dev page (min 6 characters). Required on the first run.
  INITIAL_DEV_PASSWORD: '',
  FIRST_BATCH_NAME: 'Batch 4',
  // yyyy-MM-dd; empty = today.
  FIRST_BATCH_START: ''
};

function setup() {
  var log = runSetup_({
    rootFolder: SETUP.ROOT_FOLDER_ID, password: SETUP.INITIAL_DEV_PASSWORD,
    firstBatchName: SETUP.FIRST_BATCH_NAME, firstBatchStart: SETUP.FIRST_BATCH_START
  });
  Logger.log(log);
  return log;
}

/** Called by the first-run setup page. Only the owner account may run it. */
function apiRunSetup(opts) {
  if (!isOwner_()) throw new Error('Hanya pemilik aplikasi yang bisa menjalankan setup.');
  if (props_().getProperty('SETUP_DONE')) throw new Error('Aplikasi sudah di-setup.');
  if (String((opts && opts.password) || '').length < 6) throw new Error('Password minimal 6 karakter.');
  return withLock_(function () { return runSetup_(opts || {}); });
}

function folderIdFromInput_(s) {
  s = String(s || '').trim();
  var m = /\/folders\/([-\w]+)/.exec(s) || /[?&]id=([-\w]+)/.exec(s);
  return m ? m[1] : s;
}

/** opts: { rootFolder, password, firstBatchName, firstBatchStart } */
function runSetup_(opts) {
  var p = props_();
  var log = [];

  var wanted = folderIdFromInput_(opts.rootFolder);
  var rootId = p.getProperty('ROOT_FOLDER_ID');
  if (wanted && wanted !== rootId) {
    DriveApp.getFolderById(wanted); // throws if the folder is not accessible
    rootId = wanted;
    p.setProperty('ROOT_FOLDER_ID', rootId);
    log.push('Root folder set (new batches are created here).');
  }
  if (!rootId) {
    rootId = DriveApp.createFolder(DEFAULT_ROOT_FOLDER_NAME).getId();
    p.setProperty('ROOT_FOLDER_ID', rootId);
    log.push('Created root folder "' + DEFAULT_ROOT_FOLDER_NAME + '".');
  }
  var root = DriveApp.getFolderById(rootId);

  if (opts.password) {
    setDevPasswordHash_(opts.password);
    log.push('Dev password saved.');
  } else if (!p.getProperty('DEV_PASSWORD_HASH')) {
    throw new Error('Isi password Dev (min 6 karakter) lalu jalankan setup lagi.');
  }

  if (!p.getProperty('REGISTRY_ID')) {
    var reg = SpreadsheetApp.create(REGISTRY_FILE_NAME);
    DriveApp.getFileById(reg.getId()).moveTo(root);
    p.setProperty('REGISTRY_ID', reg.getId());
    getRegistrySheet_();
    var first = reg.getSheetByName('Sheet1') || reg.getSheetByName('Sheet 1');
    if (first && reg.getSheets().length > 1) reg.deleteSheet(first);
    log.push('Created registry spreadsheet.');
  }

  if (!listBatches_().length) {
    var meta = createBatch_({ name: opts.firstBatchName || 'Batch 4', startDate: opts.firstBatchStart || today_() });
    log.push('Created first batch "' + meta.name + '".');
  }

  p.setProperty('SETUP_DONE', 'true');
  log.push('Root folder: ' + root.getUrl());
  return log.join('\n');
}
