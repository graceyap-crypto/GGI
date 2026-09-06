# GGI Expense Claim Log

A per-claim expense logger, built the same way as the team expense
claim app in `apps-script/` (see the [repo root README](../README.md)):
a Google Apps Script web app, so it needs no separate hosting and works
directly with Drive/Sheets/Gmail.

Live Drive workspace: [GGI Expense Claims](https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf)
(already created — see "What's already set up" below).

See [FLOW.md](FLOW.md) for the end-to-end submission/approval flow.

## How this differs from the (country/currency) expense claim app

The `apps-script/` app at the repo root logs one foreign-currency claim
at a time, converting to SGD via a Finance-maintained FX rate. This app
is for logging multiple **already-in-SGD** expenses under a single
claim in one go — e.g. after a business trip, submit every taxi, meal,
and incidental receipt at once instead of one form per receipt.

## Claim categories

Every submission picks one category up front:

- **Travel** — the original flow: destination + trip date range, with
  subcategories Transport, Food, Entertainment, or Misc.
- **General** — a single claim date instead of a trip, with
  subcategories Training, Fixed Asset, Entertainment, Meal, Transport,
  Medical, or Miscellaneous.

Both categories support the same multi-item submission, file uploads,
and audit trail described below — the category only changes which
header fields are shown and which subcategory list the expense items
choose from.

## What the form collects

Always: employee name/email.

For a **Travel** claim: destination, and the trip's date range (from –
to).

For a **General** claim: a single claim date.

For each expense item (add as many as needed in one submission):
- Category (subcategory list depends on Travel vs General, above)
- Description
- Amount in SGD
- Receipt — one or more files (PDF/JPG/PNG), required
- Credit card statement — one or more files, optional (attach when the
  expense was paid on a company card, as corroborating proof of charge)

On submit, the app automatically:

- Generates a unique claim code, prefixed by category and sequential
  per year (`TRIP-YYYY-0001` for Travel, `GEN-YYYY-0001` for General —
  independent sequences, so neither steals numbers from the other)
- Creates (or reuses) a Drive folder for that employee, a folder for
  the claim inside it, and a numbered subfolder per expense item to
  keep receipts (and any credit card statements) organized and never
  mixed between items or claims
- Appends one row per expense item to the Expense Claim Log sheet (the
  audit trail), all sharing the same claim code/category/destination or
  claim date
- Emails the approver(s) a claim summary (item count, total SGD, link
  to receipts)

## What's already set up in Google Drive

| Item | Purpose | Link |
|---|---|---|
| `GGI Expense Claims` (folder) | Root folder for this app | [Open](https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf) |
| `Receipts` (folder) | Contains one auto-created subfolder per employee, then per claim, then per item | [Open](https://drive.google.com/drive/folders/1WnQo_LqoyRgik9iKAjB6CJuoy0FJHcgF) |
| `GGI Expense Claim Log` (sheet) | Append-only log of every expense item — the audit trail | [Open](https://docs.google.com/spreadsheets/d/1qXU0-ejXqkSgByRhMhjumOQw2R128ib04UkQCqV7YAs/edit) |

The IDs of these files are already wired into `travel-receipts-app/Config.gs`.

**One manual step required before this update works:** the sheet still
has its original 18 columns. Add two more headers at the end of row 1
(columns S and T): **`Claim Category`** and **`Claim Date`**. The app
appends to these two new columns for every row; existing rows are
unaffected (Travel rows will just have those two cells blank until you
add them, which is fine — they were already fully Travel claims).

## Deploying the app (one-time, ~5 minutes)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename the project, e.g. "GGI Expense Claim Log".
3. Re-create the files in this folder with matching names:
   - `Config.gs`
   - `Code.gs`
   - `Index.html` (use **File → New → HTML file**, name it `Index`)
   - Update `appsscript.json` via **Project Settings → Show "appsscript.json"**,
     then paste this folder's version.
   Copy-paste each file's content directly — no build step needed.
4. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me** (matches `appsscript.json`'s `executeAs`;
     mismatching this with the dropdown here is what causes an
     HTTP 400 on deploy)
   - Who has access: **Anyone within [your domain]**
5. Authorize the requested scopes (Drive, Sheets, Gmail) when prompted.
6. Copy the deployment's **Web app URL** and share it with the team.
7. Edit `CONFIG.APPROVER_EMAILS` in `Config.gs` to list whoever should be
   notified of new claim submissions, then redeploy (**Deploy → Manage
   deployments → Edit → New version**).

**To test it:** don't use the editor's Run ▶ button — `doGet` is a web
app entry point and the button can't invoke it directly (you'll see
"Script function not found: doGet", which is expected and not a bug).
Instead use **Deploy → Test deployments** for a test URL, or open the
Web app URL from a full deployment.

### Updating the app later

Edit the files in the Apps Script editor, then **Deploy → Manage
deployments → Edit → New version** — the same URL keeps working.

## Adding or changing subcategories

Edit `TRAVEL_SUBCATEGORIES` or `GENERAL_SUBCATEGORIES` in `Config.gs`.
If you add a brand-new subcategory name, also add a matching
`.item[data-type="..."]` color rule in `Index.html`'s `<style>` block
(optional — it just falls back to a neutral gray border without one).

## Repository layout

```
travel-receipts-app/
  Config.gs        Drive/Sheet IDs, approver list, code prefixes,
                   Travel/General subcategory lists
  Code.gs          Claim validation, claim codes, folder/file creation,
                   sheet logging, notifications
  Index.html       The claim form UI (Travel/General toggle,
                   repeatable expense items)
  appsscript.json  Apps Script project manifest
FLOW.md            Submission & approval flow
README.md          This file
```
