# GGI Travel Receipt Log

A per-trip receipt logger, built the same way as the team expense claim
app in `apps-script/` (see the [repo root README](../README.md)): a
Google Apps Script web app, so it needs no separate hosting and works
directly with Drive/Sheets/Gmail.

Live Drive workspace: [GGI Travel Receipt Claims](https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf)
(already created — see "What's already set up" below).

See [FLOW.md](FLOW.md) for the end-to-end submission/approval flow.

## How this differs from the expense claim app

The `apps-script/` app at the repo root logs one foreign-currency claim
at a time, converting to SGD via a Finance-maintained FX rate. This app
is for logging multiple **already-in-SGD** travel expenses under a
single trip in one go — e.g. after a business trip, submit every taxi,
meal, and incidental receipt at once instead of one form per receipt.

## What the form collects

For the trip: employee name/email, destination, and the trip's date
range (from – to).

For each expense item (add as many as needed in one submission):
- Claim type: Transport, Food, Entertainment, or Misc
- Description
- Amount in SGD
- Receipt — one or more files (PDF/JPG/PNG), required
- Credit card statement — one or more files, optional (attach when the
  expense was paid on a company card, as corroborating proof of charge)

On submit, the app automatically:

- Generates a unique trip code (`TRIP-YYYY-0001`, sequential per year)
- Creates (or reuses) a Drive folder for that employee, a folder for
  the trip inside it, and a numbered subfolder per expense item to keep
  receipts (and any credit card statements) organized and never mixed
  between items or trips
- Appends one row per expense item to the Travel Receipts Log sheet
  (the audit trail), all sharing the same trip code/destination/dates
- Emails the approver(s) a trip summary (item count, total SGD, link
  to receipts)

## What's already set up in Google Drive

| Item | Purpose | Link |
|---|---|---|
| `GGI Travel Receipt Claims` (folder) | Root folder for this app | [Open](https://drive.google.com/drive/folders/1y8nq72XTBDSlya4TXdiKh4Fts_WSOmwf) |
| `Receipts` (folder) | Contains one auto-created subfolder per employee, then per trip, then per item | [Open](https://drive.google.com/drive/folders/1WnQo_LqoyRgik9iKAjB6CJuoy0FJHcgF) |
| `GGI Travel Receipts Log` (sheet) | Append-only log of every expense item — the audit trail | [Open](https://docs.google.com/spreadsheets/d/1qXU0-ejXqkSgByRhMhjumOQw2R128ib04UkQCqV7YAs/edit) |

The IDs of these files are already wired into `travel-receipts-app/Config.gs`.

## Deploying the app (one-time, ~5 minutes)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename the project, e.g. "GGI Travel Receipt Log".
3. Re-create the files in this folder with matching names:
   - `Config.gs`
   - `Code.gs`
   - `Index.html` (use **File → New → HTML file**, name it `Index`)
   - Update `appsscript.json` via **Project Settings → Show "appsscript.json"**,
     then paste this folder's version.
   Copy-paste each file's content directly — no build step needed.
4. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **User accessing the web app**
   - Who has access: **Anyone within [your domain]**
5. Authorize the requested scopes (Drive, Sheets, Gmail) when prompted.
6. Copy the deployment's **Web app URL** and share it with the team.
7. Edit `CONFIG.APPROVER_EMAILS` in `Config.gs` to list whoever should be
   notified of new trip submissions, then redeploy (**Deploy → Manage
   deployments → Edit → New version**).

**To test it:** don't use the editor's Run ▶ button — `doGet` is a web
app entry point and the button can't invoke it directly (you'll see
"Script function not found: doGet", which is expected and not a bug).
Instead use **Deploy → Test deployments** for a test URL, or open the
Web app URL from a full deployment.

### Updating the app later

Edit the files in the Apps Script editor, then **Deploy → Manage
deployments → Edit → New version** — the same URL keeps working.

## Adding or changing claim types

Edit `CLAIM_TYPES` in `Config.gs`.

## Repository layout

```
travel-receipts-app/
  Config.gs        Drive/Sheet IDs, approver list, claim types
  Code.gs          Trip validation, trip codes, folder/file creation,
                   sheet logging, notifications
  Index.html       The trip form UI (repeatable expense items)
  appsscript.json  Apps Script project manifest
FLOW.md            Submission & approval flow
README.md          This file
```
