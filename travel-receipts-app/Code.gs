/**
 * GGI Travel Receipt Log App
 * Serves a per-trip form (destination + date range) with one or more
 * expense line items (claim type, description, SGD amount, receipt,
 * optional credit card statement).
 *
 * Submission is broken down to one Drive file per request (startTrip ->
 * startItem -> one uploadItemFile call per receipt/statement file ->
 * finishItem -> ... -> finalizeTrip), rather than bundling multiple
 * files into a single request. A request carrying several receipt
 * photos can be large enough that a network intermediary (corporate
 * proxy/firewall) rejects it outright before it reaches Google, which
 * shows up in the browser as a plain network error rather than an app
 * error - even bundling just one item's files hit this once an item
 * had a large enough photo/statement attached. Uploading strictly one
 * file per request keeps every request small regardless of how many
 * items or files a trip has.
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  template.claimTypes = CONFIG.CLAIM_TYPES;
  template.maxFileSizeBytes = CONFIG.MAX_FILE_SIZE_BYTES;
  template.maxFileSizeMB = Math.round(CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024));
  return template.evaluate()
    .setTitle('GGI Travel Receipt Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Step 1: validates the trip header, generates the trip code, and
 * creates the employee/trip folders. Called once per submission.
 * @param {Object} header - { employeeName, employeeEmail, destination,
 *   startDate, endDate, itemCount }
 */
function startTrip(header) {
  validateTripHeader_(header);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var tripCode;
  try {
    tripCode = generateTripCode_();
  } finally {
    lock.releaseLock();
  }

  var employeeFolder = getOrCreateEmployeeFolder_(header.employeeName, header.employeeEmail);
  var tripFolder = employeeFolder.createFolder(
    tripCode + ' - ' + header.destination + ' (' + header.startDate + ' to ' + header.endDate + ')'
  );

  return { tripCode: tripCode, tripFolderId: tripFolder.getId(), tripFolderUrl: tripFolder.getUrl() };
}

/**
 * Step 2: creates the numbered folder for one expense item, before any
 * of its files are uploaded.
 * @param {Object} args - { tripFolderId, index, claimType }
 */
function startItem(args) {
  if (CONFIG.CLAIM_TYPES.indexOf(args.claimType) === -1) {
    throw new Error('Item ' + (args.index + 1) + ': invalid claim type.');
  }
  var tripFolder = DriveApp.getFolderById(args.tripFolderId);
  var itemFolder = tripFolder.createFolder(
    Utilities.formatString('%02d', args.index + 1) + ' - ' + args.claimType
  );
  return { itemFolderId: itemFolder.getId(), itemFolderUrl: itemFolder.getUrl() };
}

/**
 * Step 3: uploads exactly one file (a receipt or a credit card
 * statement page) into an item's folder. Called once per file.
 * @param {Object} args - { itemFolderId, isCC, index,
 *   file: {name, mimeType, base64} }
 */
function uploadItemFile(args) {
  var bytes = Math.ceil((args.file.base64.length * 3) / 4);
  if (bytes > CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new Error(
      'Item ' + (args.index + 1) + ': file "' + args.file.name + '" exceeds the ' +
      (CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)) + ' MB limit.'
    );
  }

  var itemFolder = DriveApp.getFolderById(args.itemFolderId);
  var targetFolder = itemFolder;
  if (args.isCC) {
    var existing = itemFolder.getFoldersByName('Credit Card Statement');
    targetFolder = existing.hasNext() ? existing.next() : itemFolder.createFolder('Credit Card Statement');
  }

  var decoded = Utilities.base64Decode(args.file.base64);
  var blob = Utilities.newBlob(decoded, args.file.mimeType, args.file.name);
  targetFolder.createFile(blob);

  return { name: args.file.name, folderUrl: targetFolder.getUrl() };
}

/**
 * Step 4: called once per item, after all of its files have uploaded,
 * to validate the item's fields and append its row to the log.
 * @param {Object} args - { tripCode, header, index, claimType,
 *   description, amount, itemFolderUrl,
 *   receiptNames: string[], ccFolderUrl, ccNames: string[] }
 */
function finishItem(args) {
  var label = 'Item ' + (args.index + 1);
  if (!args.description || !args.description.trim()) throw new Error(label + ': description is required.');
  if (!args.amount || isNaN(args.amount) || Number(args.amount) <= 0) throw new Error(label + ': amount must be a positive number.');
  if (!args.receiptNames || args.receiptNames.length === 0) throw new Error(label + ': at least one receipt file is required.');

  appendLogRow_({
    tripCode: args.tripCode,
    employeeName: args.header.employeeName,
    employeeEmail: args.header.employeeEmail,
    destination: args.header.destination,
    startDate: args.header.startDate,
    endDate: args.header.endDate,
    claimType: args.claimType,
    description: args.description,
    amount: Number(args.amount),
    receiptUrl: args.itemFolderUrl,
    receiptNames: args.receiptNames.join('; '),
    ccUrl: args.ccFolderUrl || '',
    ccNames: (args.ccNames || []).join('; ')
  });

  return { amount: Number(args.amount) };
}

/**
 * Step 5: called once after every item has been submitted successfully.
 * Sends the approver notification with the trip-level summary.
 */
function finalizeTrip(tripCode, header, itemCount, total, tripFolderUrl) {
  notifyApprovers_(tripCode, header, itemCount, total, tripFolderUrl);
  return {
    tripCode: tripCode,
    itemCount: itemCount,
    total: Math.round(total * 100) / 100,
    folderUrl: tripFolderUrl
  };
}

function validateTripHeader_(header) {
  if (!header) throw new Error('Missing trip data.');
  if (!header.employeeName || !header.employeeName.trim()) throw new Error('Employee name is required.');
  if (!header.employeeEmail || !/^\S+@\S+\.\S+$/.test(header.employeeEmail)) throw new Error('A valid employee email is required.');
  if (!header.destination || !header.destination.trim()) throw new Error('Destination is required.');
  if (!header.startDate || !header.endDate) throw new Error('Both a start and end date are required.');
  if (new Date(header.startDate) > new Date(header.endDate)) throw new Error('Trip start date must be on or before the end date.');
  if (!header.itemCount || header.itemCount < 1) throw new Error('Add at least one expense item.');
  if (header.itemCount > CONFIG.MAX_ITEMS) throw new Error('No more than ' + CONFIG.MAX_ITEMS + ' expense items per trip.');
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

function notifyApprovers_(tripCode, header, itemCount, total, folderUrl) {
  if (!CONFIG.APPROVER_EMAILS || CONFIG.APPROVER_EMAILS.length === 0) return;
  var subject = 'New travel receipts ' + tripCode + ' - ' + header.employeeName + ' (' + header.destination + ')';
  var body = [
    'A new set of travel receipts has been submitted.',
    '',
    'Trip code: ' + tripCode,
    'Employee: ' + header.employeeName + ' (' + header.employeeEmail + ')',
    'Destination: ' + header.destination,
    'Dates: ' + header.startDate + ' to ' + header.endDate,
    'Items: ' + itemCount,
    'Total: SGD ' + total.toFixed(2),
    '',
    'Receipts: ' + folderUrl,
    '',
    'Approve or reject each line item by updating the Status column in the GGI Travel Receipts Log.'
  ].join('\n');
  MailApp.sendEmail(CONFIG.APPROVER_EMAILS.join(','), subject, body);
}
