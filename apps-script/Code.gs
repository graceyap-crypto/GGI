/**
 * GGI Team Expense Claim App
 * Serves the claim form and handles submissions: validates input,
 * converts the local amount to SGD using the finance-maintained FX
 * rate sheet, files receipts under a per-employee Drive folder, and
 * appends an auditable row to the Claims Register sheet.
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  template.countries = Object.keys(COUNTRY_CURRENCY_MAP).sort();
  template.currencyMap = COUNTRY_CURRENCY_MAP;
  var logo = getLogo_();
  template.logoDataUri = logo.uri;
  template.logoDebug = logo.error || 'loaded ok';
  return template.evaluate()
    .setTitle('GGI Team Expense Claim')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fetches the header logo from Drive and returns it as a data: URI so it
 * can be embedded directly in the page with no separate hosting/sharing
 * step. On failure (missing file, or the viewer lacks access), returns an
 * empty uri (the page just skips the logo, rather than breaking the form)
 * plus the error message, which Index.html writes into an HTML comment so
 * "View Page Source" shows exactly why the logo didn't load.
 */
function getLogo_() {
  try {
    var blob = DriveApp.getFileById(CONFIG.LOGO_FILE_ID).getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return { uri: 'data:' + blob.getContentType() + ';base64,' + base64, error: '' };
  } catch (e) {
    return { uri: '', error: e.message || String(e) };
  }
}

/**
 * Entry point called from the form via google.script.run.
 * @param {Object} form - { employeeName, employeeEmail, country, localCurrency,
 *                           amount, description, files: [{name, mimeType, base64}] }
 */
function submitClaim(form) {
  validateForm_(form);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var claimCode;
  try {
    claimCode = generateClaimCode_();
  } finally {
    lock.releaseLock();
  }

  var fx = getFxRate_(form.country);
  var localAmount = Number(form.amount);
  var sgdAmount = Math.round(localAmount * fx.rate * 100) / 100;

  var employeeFolder = getOrCreateEmployeeFolder_(form.employeeName, form.employeeEmail);
  var claimFolder = employeeFolder.createFolder(
    claimCode + ' - ' + Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd')
  );

  var fileNames = saveReceipts_(claimFolder, form.files);

  appendClaimRow_({
    claimCode: claimCode,
    employeeName: form.employeeName,
    employeeEmail: form.employeeEmail,
    country: form.country,
    localCurrency: form.localCurrency,
    localAmount: localAmount,
    fxRate: fx.rate,
    sgdAmount: sgdAmount,
    rateSource: fx.source,
    rateDate: fx.date,
    description: form.description,
    folderUrl: claimFolder.getUrl(),
    fileNames: fileNames.join('; ')
  });

  notifyApprovers_(claimCode, form, sgdAmount, claimFolder.getUrl());

  return {
    claimCode: claimCode,
    sgdAmount: sgdAmount,
    fxRate: fx.rate,
    folderUrl: claimFolder.getUrl()
  };
}

function validateForm_(form) {
  if (!form) throw new Error('Missing form data.');
  if (!form.employeeName || !form.employeeName.trim()) throw new Error('Employee name is required.');
  if (!form.employeeEmail || !/^\S+@\S+\.\S+$/.test(form.employeeEmail)) throw new Error('A valid employee email is required.');
  if (!form.country || !COUNTRY_CURRENCY_MAP[form.country]) throw new Error('Please select a valid country.');
  if (!form.localCurrency) throw new Error('Local currency is required.');
  if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) throw new Error('Amount must be a positive number.');
  if (!form.description || !form.description.trim()) throw new Error('A description / purpose is required.');
  if (!form.files || form.files.length === 0) throw new Error('At least one receipt file must be attached.');
  if (form.files.length > CONFIG.MAX_FILES) throw new Error('No more than ' + CONFIG.MAX_FILES + ' receipt files per claim.');
  form.files.forEach(function (f) {
    var bytes = Math.ceil((f.base64.length * 3) / 4);
    if (bytes > CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error('File "' + f.name + '" exceeds the ' + (CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)) + ' MB limit.');
    }
  });
}

/**
 * Sequential, human-readable claim code: GGI-YYYY-0001
 * Sequence resets each year and is derived from the last row in the
 * register so there is no separate counter to keep in sync.
 */
function generateClaimCode_() {
  var sheet = SpreadsheetApp.openById(CONFIG.CLAIMS_SHEET_ID).getSheetByName(CONFIG.CLAIMS_SHEET_NAME);
  var year = new Date().getFullYear();
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;

  if (lastRow > 1) {
    var codes = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var prefix = CONFIG.CLAIM_CODE_PREFIX + '-' + year + '-';
    codes.forEach(function (row) {
      var code = String(row[0] || '');
      if (code.indexOf(prefix) === 0) {
        var seq = parseInt(code.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  var next = String(maxSeq + 1).padStart(4, '0');
  return CONFIG.CLAIM_CODE_PREFIX + '-' + year + '-' + next;
}

/**
 * Looks up the SGD conversion rate from the finance-maintained
 * "GGI FX Rates Reference" sheet. Fails loudly rather than guessing,
 * so a missing/blank rate can't silently misstate a claim's SGD value.
 */
function getFxRate_(country) {
  var sheet = SpreadsheetApp.openById(CONFIG.FX_SHEET_ID).getSheetByName(CONFIG.FX_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === country) {
      var rate = data[i][2];
      if (rate === '' || rate === 'UPDATE' || isNaN(rate)) {
        throw new Error('No FX rate is on file yet for ' + country + '. Ask Finance to update the GGI FX Rates Reference sheet before submitting this claim.');
      }
      return {
        rate: Number(rate),
        source: data[i][4] || 'Manual (Finance)',
        date: data[i][3] || ''
      };
    }
  }
  throw new Error('Country "' + country + '" was not found in the FX Rates Reference sheet.');
}

function getOrCreateEmployeeFolder_(employeeName, employeeEmail) {
  var root = DriveApp.getFolderById(CONFIG.RECEIPTS_ROOT_FOLDER_ID);
  var folderName = employeeName.trim() + ' (' + employeeEmail.trim() + ')';
  var existing = root.getFoldersByName(folderName);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(folderName);
}

function saveReceipts_(folder, files) {
  return files.map(function (f) {
    var decoded = Utilities.base64Decode(f.base64);
    var blob = Utilities.newBlob(decoded, f.mimeType, f.name);
    folder.createFile(blob);
    return f.name;
  });
}

function appendClaimRow_(c) {
  var sheet = SpreadsheetApp.openById(CONFIG.CLAIMS_SHEET_ID).getSheetByName(CONFIG.CLAIMS_SHEET_NAME);
  sheet.appendRow([
    new Date(),
    c.claimCode,
    c.employeeName,
    c.employeeEmail,
    c.country,
    c.localCurrency,
    c.localAmount,
    c.fxRate,
    c.sgdAmount,
    c.rateSource,
    c.rateDate,
    c.description,
    c.folderUrl,
    c.fileNames,
    'Pending Approval',
    '',
    '',
    ''
  ]);
}

function notifyApprovers_(claimCode, form, sgdAmount, folderUrl) {
  if (!CONFIG.APPROVER_EMAILS || CONFIG.APPROVER_EMAILS.length === 0) return;
  var subject = 'New expense claim ' + claimCode + ' - ' + form.employeeName;
  var body = [
    'A new expense claim has been submitted.',
    '',
    'Claim code: ' + claimCode,
    'Employee: ' + form.employeeName + ' (' + form.employeeEmail + ')',
    'Country: ' + form.country,
    'Amount: ' + form.amount + ' ' + form.localCurrency + ' (approx. SGD ' + sgdAmount.toFixed(2) + ')',
    'Description: ' + form.description,
    'Receipts: ' + folderUrl,
    '',
    'Approve or reject by updating the Status column in the GGI Expense Claims Register.'
  ].join('\n');
  MailApp.sendEmail(CONFIG.APPROVER_EMAILS.join(','), subject, body);
}
