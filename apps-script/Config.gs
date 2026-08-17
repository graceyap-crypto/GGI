/**
 * Central configuration for the GGI Team Expense Claim app.
 * These IDs point at the Drive assets created for this app:
 *   https://drive.google.com/drive/folders/1N_dnZ8n7gfHb1E0f_WJzXaPZbGRvkZ2E
 */
var CONFIG = {
  ROOT_FOLDER_ID: '1N_dnZ8n7gfHb1E0f_WJzXaPZbGRvkZ2E',
  RECEIPTS_ROOT_FOLDER_ID: '1tmhqsMiKGSyUHHeI87pMCGeVSN2jZfAj',
  CLAIMS_SHEET_ID: '1C4Fh2Rklvtd__gKIXyruaOgXycZCOA4rhq1ARRTE3ZQ',
  FX_SHEET_ID: '1UepPDt9Lx-SHmMMkS0uJUswP64mVq_-RNddDe9a8tec',
  CLAIMS_SHEET_NAME: 'Sheet1',
  FX_SHEET_NAME: 'Sheet1',
  CLAIM_CODE_PREFIX: 'GGI',
  // Approver(s) notified by email whenever a new claim is submitted.
  APPROVER_EMAILS: ['grace.yap@greengeninnovations.com'],
  MAX_FILES: 10,
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024 // 15 MB per receipt
};

/**
 * Countries and their local currency, kept in sync with the
 * "GGI FX Rates Reference" sheet tab. Edit both places together.
 */
var COUNTRY_CURRENCY_MAP = {
  'Singapore': 'SGD',
  'Malaysia': 'MYR',
  'Indonesia': 'IDR',
  'Vietnam': 'VND',
  'Thailand': 'THB',
  'Philippines': 'PHP',
  'China': 'CNY',
  'Hong Kong': 'HKD',
  'Taiwan': 'TWD',
  'Japan': 'JPY',
  'South Korea': 'KRW',
  'India': 'INR',
  'Australia': 'AUD',
  'United Kingdom': 'GBP',
  'United States': 'USD',
  'Myanmar': 'MMK',
  'Cambodia': 'KHR'
};
