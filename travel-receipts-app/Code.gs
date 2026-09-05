/**
 * GGI Travel Receipt Log App
 * Serves a per-trip form (destination + date range) with one or more
 * expense line items (claim type, description, SGD amount, receipt,
 * optional credit card statement). On submit: validates input, files
 * every attachment under a per-employee/per-trip Drive folder, appends
 * one auditable row per line item to the Travel Receipts Log sheet,
 * and emails the approver a trip summary.
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  template.claimTypes = CONFIG.CLAIM_TYPES;
  return template.evaluate()
    .setTitle('GGI Travel Receipt Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Entry point called from the form via google.script.run.
 * @param {Object} trip - { employeeName, employeeEmail, destination,
 *   startDate, endDate, items: [{ claimType, description, amount,
 *   receiptFiles: [{name, mimeType, base64}],
 *   ccFiles: [{name, mimeType, base64}] }] }
 */
function submitTrip(trip) {
  validateTrip_(trip);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var tripCode;
  try {
    tripCode = generateTripCode_();
  } finally {
    lock.releaseLock();
  }

  var employeeFolder = getOrCreateEmployeeFolder_(trip.employeeName, trip.employeeEmail);
  var tripFolder = employeeFolder.createFolder(
    tripCode + ' - ' + trip.destination + ' (' + trip.startDate + ' to ' + trip.endDate + ')'
  );

  var total = 0;
  trip.items.forEach(function (item, i) {
    total += Number(item.amount);
    var itemFolder = tripFolder.createFolder(
      Utilities.formatString('%02d', i + 1) + ' - ' + item.claimType
    );
    var receiptNames = saveFiles_(itemFolder, item.receiptFiles);
    var ccNames = [];
    var ccFolderUrl = '';
    if (item.ccFiles && item.ccFiles.length > 0) {
      var ccFolder = itemFolder.createFolder('Credit Card Statement');
      ccNames = saveFiles_(ccFolder, item.ccFiles);
      ccFolderUrl = ccFolder.getUrl();
    }

    appendLogRow_({
      tripCode: tripCode,
      employeeName: trip.employeeName,
      employeeEmail: trip.employeeEmail,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      claimType: item.claimType,
      description: item.description,
      amount: Number(item.amount),
      receiptUrl: itemFolder.getUrl(),
      receiptNames: receiptNames.join('; '),
      ccUrl: ccFolderUrl,
      ccNames: ccNames.join('; ')
    });
  });

  notifyApprovers_(tripCode, trip, total, tripFolder.getUrl());

  return {
    tripCode: tripCode,
    itemCount: trip.items.length,
    total: Math.round(total * 100) / 100,
    folderUrl: tripFolder.getUrl()
  };
}

function validateTrip_(trip) {
  if (!trip) throw new Error('Missing trip data.');
  if (!trip.employeeName || !trip.employeeName.trim()) throw new Error('Employee name is required.');
  if (!trip.employeeEmail || !/^\S+@\S+\.\S+$/.test(trip.employeeEmail)) throw new Error('A valid employee email is required.');
  if (!trip.destination || !trip.destination.trim()) throw new Error('Destination is required.');
  if (!trip.startDate || !trip.endDate) throw new Error('Both a start and end date are required.');
  if (new Date(trip.startDate) > new Date(trip.endDate)) throw new Error('Trip start date must be on or before the end date.');
  if (!trip.items || trip.items.length === 0) throw new Error('Add at least one expense item.');
  if (trip.items.length > CONFIG.MAX_ITEMS) throw new Error('No more than ' + CONFIG.MAX_ITEMS + ' expense items per trip.');

  trip.items.forEach(function (item, i) {
    var label = 'Item ' + (i + 1);
    if (CONFIG.CLAIM_TYPES.indexOf(item.claimType) === -1) throw new Error(label + ': invalid claim type.');
    if (!item.description || !item.description.trim()) throw new Error(label + ': description is required.');
    if (!item.amount || isNaN(item.amount) || Number(item.amount) <= 0) throw new Error(label + ': amount must be a positive number.');
    if (!item.receiptFiles || item.receiptFiles.length === 0) throw new Error(label + ': at least one receipt file is required.');
    if (item.receiptFiles.length > CONFIG.MAX_FILES_PER_ITEM) throw new Error(label + ': no more than ' + CONFIG.MAX_FILES_PER_ITEM + ' receipt files.');
    if (item.ccFiles && item.ccFiles.length > CONFIG.MAX_FILES_PER_ITEM) throw new Error(label + ': no more than ' + CONFIG.MAX_FILES_PER_ITEM + ' credit card statement files.');
    (item.receiptFiles || []).concat(item.ccFiles || []).forEach(function (f) {
      var bytes = Math.ceil((f.base64.length * 3) / 4);
      if (bytes > CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(label + ': file "' + f.name + '" exceeds the ' + (CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)) + ' MB limit.');
      }
    });
  });
}

/**
 * Sequential, human-readable trip code: TRIP-YYYY-0001
 * Sequence resets each year and is derived from the last row in the
 * log so there is no separate counter to keep in sync.
 */
function generateTripCode_() {
  var sheet = SpreadsheetApp.openById(CONFIG.LOG_SHEET_ID).getSheetByName(CONFIG.LOG_SHEET_NAME);
  var year = new Date().getFullYear();
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;

  if (lastRow > 1) {
    var codes = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var prefix = CONFIG.TRIP_CODE_PREFIX + '-' + year + '-';
    codes.forEach(function (row) {
      var code = String(row[0] || '');
      if (code.indexOf(prefix) === 0) {
        var seq = parseInt(code.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  var next = String(maxSeq + 1).padStart(4, '0');
  return CONFIG.TRIP_CODE_PREFIX + '-' + year + '-' + next;
}

function getOrCreateEmployeeFolder_(employeeName, employeeEmail) {
  var root = DriveApp.getFolderById(CONFIG.RECEIPTS_ROOT_FOLDER_ID);
  var folderName = employeeName.trim() + ' (' + employeeEmail.trim() + ')';
  var existing = root.getFoldersByName(folderName);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(folderName);
}

function saveFiles_(folder, files) {
  return files.map(function (f) {
    var decoded = Utilities.base64Decode(f.base64);
    var blob = Utilities.newBlob(decoded, f.mimeType, f.name);
    folder.createFile(blob);
    return f.name;
  });
}

function appendLogRow_(r) {
  var sheet = SpreadsheetApp.openById(CONFIG.LOG_SHEET_ID).getSheetByName(CONFIG.LOG_SHEET_NAME);
  sheet.appendRow([
    new Date(),
    r.tripCode,
    r.employeeName,
    r.employeeEmail,
    r.destination,
    r.startDate,
    r.endDate,
    r.claimType,
    r.description,
    r.amount,
    r.receiptUrl,
    r.receiptNames,
    r.ccUrl,
    r.ccNames,
    'Pending Approval',
    '',
    '',
    ''
  ]);
}

function notifyApprovers_(tripCode, trip, total, folderUrl) {
  if (!CONFIG.APPROVER_EMAILS || CONFIG.APPROVER_EMAILS.length === 0) return;
  var subject = 'New travel receipts ' + tripCode + ' - ' + trip.employeeName + ' (' + trip.destination + ')';
  var body = [
    'A new set of travel receipts has been submitted.',
    '',
    'Trip code: ' + tripCode,
    'Employee: ' + trip.employeeName + ' (' + trip.employeeEmail + ')',
    'Destination: ' + trip.destination,
    'Dates: ' + trip.startDate + ' to ' + trip.endDate,
    'Items: ' + trip.items.length,
    'Total: SGD ' + total.toFixed(2),
    '',
    'Receipts: ' + folderUrl,
    '',
    'Approve or reject each line item by updating the Status column in the GGI Travel Receipts Log.'
  ].join('\n');
  MailApp.sendEmail(CONFIG.APPROVER_EMAILS.join(','), subject, body);
}
