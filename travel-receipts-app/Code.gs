/**
 * GGI Expense Claim Log App
 * Serves a per-claim form covering two categories:
 *  - Travel: destination + date range, subcategories Transport/Food/
 *    Entertainment/Misc (the app's original flow).
 *  - General: a single claim date, subcategories Training/Fixed Asset/
 *    Entertainment/Meal/Transport/Medical/Miscellaneous.
 * Either way the claim can have one or more expense line items (claim
 * type, description, SGD amount, receipt, optional credit card
 * statement).
 *
 * Submission is broken down to one Drive file per request (startClaim ->
 * startItem -> one uploadItemFile call per receipt/statement file ->
 * finishItem -> ... -> finalizeClaim), rather than bundling multiple
 * files into a single request. A request carrying several receipt
 * photos can be large enough that a network intermediary (corporate
 * proxy/firewall) rejects it outright before it reaches Google, which
 * shows up in the browser as a plain network error rather than an app
 * error - even bundling just one item's files hit this once an item
 * had a large enough photo/statement attached. Uploading strictly one
 * file per request keeps every request small regardless of how many
 * items or files a claim has.
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  template.travelSubcategories = CONFIG.TRAVEL_SUBCATEGORIES;
  template.generalSubcategories = CONFIG.GENERAL_SUBCATEGORIES;
  template.maxFileSizeBytes = CONFIG.MAX_FILE_SIZE_BYTES;
  template.maxFileSizeMB = Math.round(CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024));
  return template.evaluate()
    .setTitle('GGI Expense Claim Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Step 1: validates the claim header, generates the claim code, and
 * creates the employee/claim folders. Called once per submission.
 * @param {Object} header - { category: 'Travel'|'General',
 *   employeeName, employeeEmail, destination, startDate, endDate,
 *   claimDate, itemCount }
 */
function startClaim(header) {
  validateHeader_(header);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var claimCode;
  try {
    claimCode = generateClaimCode_(header.category);
  } finally {
    lock.releaseLock();
  }

  var employeeFolder = getOrCreateEmployeeFolder_(header.employeeName, header.employeeEmail);
  var folderLabel = header.category === 'Travel'
    ? claimCode + ' - ' + header.destination + ' (' + header.startDate + ' to ' + header.endDate + ')'
    : claimCode + ' - General (' + header.claimDate + ')';
  var claimFolder = employeeFolder.createFolder(folderLabel);

  return { claimCode: claimCode, claimFolderId: claimFolder.getId(), claimFolderUrl: claimFolder.getUrl() };
}

/**
 * Step 2: creates the numbered folder for one expense item, before any
 * of its files are uploaded.
 * @param {Object} args - { claimFolderId, index, subcategory }
 */
function startItem(args) {
  var allowed = CONFIG.TRAVEL_SUBCATEGORIES.concat(CONFIG.GENERAL_SUBCATEGORIES);
  if (allowed.indexOf(args.subcategory) === -1) {
    throw new Error('Item ' + (args.index + 1) + ': invalid category.');
  }
  var claimFolder = DriveApp.getFolderById(args.claimFolderId);
  var itemFolder = claimFolder.createFolder(
    Utilities.formatString('%02d', args.index + 1) + ' - ' + args.subcategory
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
 * @param {Object} args - { claimCode, header, index, subcategory,
 *   description, amount, itemFolderUrl,
 *   receiptNames: string[], ccFolderUrl, ccNames: string[] }
 */
function finishItem(args) {
  var label = 'Item ' + (args.index + 1);
  if (!args.description || !args.description.trim()) throw new Error(label + ': description is required.');
  if (!args.amount || isNaN(args.amount) || Number(args.amount) <= 0) throw new Error(label + ': amount must be a positive number.');
  if (!args.receiptNames || args.receiptNames.length === 0) throw new Error(label + ': at least one receipt file is required.');

  appendLogRow_({
    claimCode: args.claimCode,
    employeeName: args.header.employeeName,
    employeeEmail: args.header.employeeEmail,
    destination: args.header.category === 'Travel' ? args.header.destination : '',
    startDate: args.header.category === 'Travel' ? args.header.startDate : '',
    endDate: args.header.category === 'Travel' ? args.header.endDate : '',
    subcategory: args.subcategory,
    description: args.description,
    amount: Number(args.amount),
    receiptUrl: args.itemFolderUrl,
    receiptNames: args.receiptNames.join('; '),
    ccUrl: args.ccFolderUrl || '',
    ccNames: (args.ccNames || []).join('; '),
    category: args.header.category,
    claimDate: args.header.category === 'General' ? args.header.claimDate : ''
  });

  return { amount: Number(args.amount) };
}

/**
 * Step 5: called once after every item has been submitted successfully.
 * Sends the approver notification with the claim-level summary.
 */
function finalizeClaim(claimCode, header, itemCount, total, claimFolderUrl) {
  notifyApprovers_(claimCode, header, itemCount, total, claimFolderUrl);
  return {
    claimCode: claimCode,
    itemCount: itemCount,
    total: Math.round(total * 100) / 100,
    folderUrl: claimFolderUrl
  };
}

function validateHeader_(header) {
  if (!header) throw new Error('Missing claim data.');
  if (header.category !== 'Travel' && header.category !== 'General') throw new Error('Select a claim category.');
  if (!header.employeeName || !header.employeeName.trim()) throw new Error('Employee name is required.');
  if (!header.employeeEmail || !/^\S+@\S+\.\S+$/.test(header.employeeEmail)) throw new Error('A valid employee email is required.');

  if (header.category === 'Travel') {
    if (!header.destination || !header.destination.trim()) throw new Error('Destination is required.');
    if (!header.startDate || !header.endDate) throw new Error('Both a start and end date are required.');
    if (new Date(header.startDate) > new Date(header.endDate)) throw new Error('Trip start date must be on or before the end date.');
  } else {
    if (!header.claimDate) throw new Error('Claim date is required.');
  }

  if (!header.itemCount || header.itemCount < 1) throw new Error('Add at least one expense item.');
  if (header.itemCount > CONFIG.MAX_ITEMS) throw new Error('No more than ' + CONFIG.MAX_ITEMS + ' expense items per claim.');
}

/**
 * Sequential, human-readable claim code: TRIP-YYYY-0001 or GEN-YYYY-0001.
 * Sequence resets each year per prefix and is derived from the last
 * matching row in the log, so there is no separate counter to keep in
 * sync, and Travel/General numbering don't interfere with each other.
 */
function generateClaimCode_(category) {
  var prefix = CONFIG.CODE_PREFIXES[category];
  var sheet = SpreadsheetApp.openById(CONFIG.LOG_SHEET_ID).getSheetByName(CONFIG.LOG_SHEET_NAME);
  var year = new Date().getFullYear();
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;

  if (lastRow > 1) {
    var codes = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var yearPrefix = prefix + '-' + year + '-';
    codes.forEach(function (row) {
      var code = String(row[0] || '');
      if (code.indexOf(yearPrefix) === 0) {
        var seq = parseInt(code.substring(yearPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  var next = String(maxSeq + 1).padStart(4, '0');
  return prefix + '-' + year + '-' + next;
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
    r.claimCode,
    r.employeeName,
    r.employeeEmail,
    r.destination,
    r.startDate,
    r.endDate,
    r.subcategory,
    r.description,
    r.amount,
    r.receiptUrl,
    r.receiptNames,
    r.ccUrl,
    r.ccNames,
    'Pending Approval',
    '',
    '',
    '',
    r.category,
    r.claimDate
  ]);
}

function notifyApprovers_(claimCode, header, itemCount, total, folderUrl) {
  if (!CONFIG.APPROVER_EMAILS || CONFIG.APPROVER_EMAILS.length === 0) return;
  var subject = 'New ' + header.category.toLowerCase() + ' claim ' + claimCode + ' - ' + header.employeeName;
  var bodyLines = [
    'A new expense claim has been submitted.',
    '',
    'Claim code: ' + claimCode,
    'Category: ' + header.category,
    'Employee: ' + header.employeeName + ' (' + header.employeeEmail + ')'
  ];
  if (header.category === 'Travel') {
    bodyLines.push('Destination: ' + header.destination);
    bodyLines.push('Dates: ' + header.startDate + ' to ' + header.endDate);
  } else {
    bodyLines.push('Claim date: ' + header.claimDate);
  }
  bodyLines.push('Items: ' + itemCount);
  bodyLines.push('Total: SGD ' + total.toFixed(2));
  bodyLines.push('');
  bodyLines.push('Receipts: ' + folderUrl);
  bodyLines.push('');
  bodyLines.push('Approve or reject each line item by updating the Status column in the GGI Expense Claim Log.');
  MailApp.sendEmail(CONFIG.APPROVER_EMAILS.join(','), subject, bodyLines.join('\n'));
}
