/**
 * Google Apps Script for the featured tournaments sheet: the only thing allowed to write to it.
 * Setup is in the README, under Featured tournaments. The key lives in the script's properties as ADMIN_KEY.
 */
var COLUMNS = ['id', 'title', 'first', 'last', 'show', 'divisions', 'teams', 'm', 'updated'];
var MAX_CELL = 49000;

function doPost(e) {
  var out;
  try {
    out = handle(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle(req) {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || req.key !== key) return { ok: false, error: 'Wrong admin key.' };
  if (req.action === 'ping') return { ok: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    ensureHeader(sheet);
    if (req.action === 'publish') return publish(sheet, req.entry);
    if (req.action === 'remove') return remove(sheet, req.id);
    return { ok: false, error: 'Unknown action.' };
  } finally {
    lock.releaseLock();
  }
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
}

/** The sheet row holding this tournament, or 0. */
function findRow(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return i + 2;
  return 0;
}

function publish(sheet, entry) {
  if (!entry || !/^(e:)?[A-Za-z0-9_-]{20,}$/.test(entry.id || '')) return { ok: false, error: 'That isn’t a sheet id.' };
  if (!entry.title) return { ok: false, error: 'The tournament has no title.' };
  if ((entry.m || '').length > MAX_CELL) return { ok: false, error: 'This reading is too long for one cell.' };
  var existing = findRow(sheet, entry.id);
  var row = existing || sheet.getLastRow() + 1;
  var cell = function (name) {
    return sheet.getRange(row, COLUMNS.indexOf(name) + 1);
  };
  var text = function (name, value) {
    cell(name).setNumberFormat('@').setValue(value || '');
  };
  text('id', entry.id);
  text('title', entry.title);
  text('first', entry.first);
  text('last', entry.last);
  text('divisions', entry.divisions);
  text('teams', entry.teams);
  text('m', entry.m);
  text('updated', new Date().toISOString());
  // Publishing again keeps a tick you've cleared by hand.
  if (!existing) cell('show').insertCheckboxes().check();
  return { ok: true };
}

function remove(sheet, id) {
  var row = findRow(sheet, id);
  if (row) sheet.deleteRow(row);
  return { ok: true };
}
