/**
 * Central configuration for the GGI Travel Receipt Log app.
 * These IDs point at the Drive assets created for this app:
 *   https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf
 */
var CONFIG = {
  ROOT_FOLDER_ID: '1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf',
  RECEIPTS_ROOT_FOLDER_ID: '1WnQo_LqoyRgik9iKAjB6CJuoy0FJHcgF',
  LOG_SHEET_ID: '1qXU0-ejXqkSgByRhMhjumOQw2R128ib04UkQCqV7YAs',
  LOG_SHEET_NAME: 'Sheet1',
  TRIP_CODE_PREFIX: 'TRIP',
  // Approver(s) notified by email whenever a new trip's receipts are submitted.
  APPROVER_EMAILS: ['grace.yap@greengeninnovations.com'],
  CLAIM_TYPES: ['Transport', 'Food', 'Entertainment', 'Misc'],
  MAX_ITEMS: 30,
  MAX_FILES_PER_ITEM: 10,
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024 // 15 MB per file
};
