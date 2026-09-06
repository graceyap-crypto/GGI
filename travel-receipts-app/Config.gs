/**
 * Central configuration for the GGI Expense Claim Log app.
 * These IDs point at the Drive assets created for this app:
 *   https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf
 */
var CONFIG = {
  ROOT_FOLDER_ID: '1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf',
  RECEIPTS_ROOT_FOLDER_ID: '1WnQo_LqoyRgik9iKAjB6CJuoy0FJHcgF',
  LOG_SHEET_ID: '1qXU0-ejXqkSgByRhMhjumOQw2R128ib04UkQCqV7YAs',
  LOG_SHEET_NAME: 'Sheet1',
  // Claim codes are prefixed by category so they stay self-describing
  // at a glance (TRIP-2026-0001 vs GEN-2026-0001), with independent
  // per-year sequences for each.
  CODE_PREFIXES: { Travel: 'TRIP', General: 'GEN' },
  // Approver(s) notified by email whenever a new claim is submitted.
  APPROVER_EMAILS: ['grace.yap@greengeninnovations.com'],
  TRAVEL_SUBCATEGORIES: ['Transport', 'Food', 'Entertainment', 'Misc'],
  GENERAL_SUBCATEGORIES: ['Training', 'Fixed Asset', 'Entertainment', 'Meal', 'Transport', 'Medical', 'Miscellaneous'],
  MAX_ITEMS: 30,
  MAX_FILES_PER_ITEM: 10,
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024 // 15 MB per file
};
