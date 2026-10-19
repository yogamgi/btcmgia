/**
 * One-time setup. Fill in SETUP below inside the Apps Script editor (signed in as
 * hrd.madinah.reload@gmail.com), choose `setup` in the function picker and press Run.
 * Running it again is safe: it only creates what is missing.
 *
 * After the first run you can clear INITIAL_DEV_PASSWORD again; the password is kept
 * as a hash in Script Properties and can be changed later from the Dev page.
 */
var SETUP = {
  // ID of the Drive folder that should hold all app data (the part after /folders/ in its URL).
  // Leave empty to let setup() create a folder called "Akademi BTC - Stage 1" in My Drive.
  ROOT_FOLDER_ID: '',
  // Password for the Dev page (min 6 characters). Required on the first run.
  INITIAL_DEV_PASSWORD: '',
  FIRST_BATCH_NAME: 'Batch 4',
  // yyyy-MM-dd; empty = today.
  FIRST_BATCH_START: ''
};

function setup() {
  var p = props_();
  var log = [];

  var rootId = p.getProperty('ROOT_FOLDER_ID');
  if (SETUP.ROOT_FOLDER_ID && SETUP.ROOT_FOLDER_ID !== rootId) {
    DriveApp.getFolderById(SETUP.ROOT_FOLDER_ID); // throws if the folder is not accessible
    rootId = SETUP.ROOT_FOLDER_ID;
    p.setProperty('ROOT_FOLDER_ID', rootId);
    log.push('Root folder set to ' + rootId + ' (new batches are created here).');
  }
  if (!rootId) {
    rootId = DriveApp.createFolder(DEFAULT_ROOT_FOLDER_NAME).getId();
    p.setProperty('ROOT_FOLDER_ID', rootId);
    log.push('Created root folder "' + DEFAULT_ROOT_FOLDER_NAME + '".');
  }
  var root = DriveApp.getFolderById(rootId);

  if (!p.getProperty('REGISTRY_ID')) {
    var reg = SpreadsheetApp.create(REGISTRY_FILE_NAME);
    DriveApp.getFileById(reg.getId()).moveTo(root);
    p.setProperty('REGISTRY_ID', reg.getId());
    getRegistrySheet_();
    var first = reg.getSheetByName('Sheet1') || reg.getSheetByName('Sheet 1');
    if (first && reg.getSheets().length > 1) reg.deleteSheet(first);
    log.push('Created registry spreadsheet.');
  }

  if (SETUP.INITIAL_DEV_PASSWORD) {
    setDevPasswordHash_(SETUP.INITIAL_DEV_PASSWORD);
    log.push('Dev password saved. You can now clear INITIAL_DEV_PASSWORD in Setup.gs.');
  } else if (!p.getProperty('DEV_PASSWORD_HASH')) {
    throw new Error('Isi SETUP.INITIAL_DEV_PASSWORD (min 6 karakter) lalu jalankan setup() lagi.');
  }

  if (!listBatches_().length) {
    var meta = createBatch_({ name: SETUP.FIRST_BATCH_NAME || 'Batch 4', startDate: SETUP.FIRST_BATCH_START || today_() });
    log.push('Created first batch "' + meta.name + '".');
  }

  log.push('Root folder: ' + root.getUrl());
  log.push('Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
  Logger.log(log.join('\n'));
  return log.join('\n');
}
