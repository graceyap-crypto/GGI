# GGI Team Expense Claim App

A lightweight expense claim form for the team, built as a Google Apps Script
web app so it needs no separate hosting and works directly with Google
Drive/Sheets/Gmail, which the team already uses.

Live Drive workspace: [GGI Team Expense Claims](https://drive.google.com/drive/folders/1N_dnZ8n7gfHb1E0f_WJzXaPZbGRvkZ2E)
(already created — see "What's already set up" below).

See [FLOW.md](FLOW.md) for the end-to-end submission/approval flow and
compliance notes.

## What the form collects

- Full name and work email
- Country and local currency (currency auto-fills from the country)
- Claim amount in local currency
- Purpose / description
- Receipts — multiple files (PDF/JPG/PNG)

On submit, the app automatically:

- Generates a unique claim code (`GGI-YYYY-0001`, sequential per year)
- Looks up the official local-currency → SGD rate from the FX Rates sheet
  and computes the SGD amount (never lets the employee enter this manually)
- Creates (or reuses) a Drive folder for that employee, and a
  claim-specific subfolder inside it, to store the receipts
- Appends one row to the Claims Register sheet (the audit trail)
- Emails the approver(s) a summary with a link to the receipts

## What's already set up in Google Drive

| Item | Purpose | Link |
|---|---|---|
| `GGI Team Expense Claims` (folder) | Root folder for the app | [Open](https://drive.google.com/drive/folders/1N_dnZ8n7gfHb1E0f_WJzXaPZbGRvkZ2E) |
| `Receipts` (folder) | Contains one auto-created subfolder per employee | [Open](https://drive.google.com/drive/folders/1tmhqsMiKGSyUHHeI87pMCGeVSN2jZfAj) |
| `GGI Expense Claims Register` (sheet) | Append-only log of every claim — the audit trail | [Open](https://docs.google.com/spreadsheets/d/1C4Fh2Rklvtd__gKIXyruaOgXycZCOA4rhq1ARRTE3ZQ/edit) |
| `GGI FX Rates Reference` (sheet) | Finance-maintained local-currency → SGD rates | [Open](https://docs.google.com/spreadsheets/d/1UepPDt9Lx-SHmMMkS0uJUswP64mVq_-RNddDe9a8tec/edit) |

The IDs of these files are already wired into `apps-script/Config.gs`.

**Before going live**, Finance should open the FX Rates sheet and replace
every `UPDATE` placeholder with the current rate (see the "Notes" column —
recommend refreshing monthly, or whenever a rate moves materially).

## Deploying the app (one-time, ~5 minutes)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename the project, e.g. "GGI Expense Claim".
3. In the editor, delete the default `Code.gs` content, and re-create the
   files in this repo's `apps-script/` folder with matching names:
   - `Config.gs`
   - `Code.gs`
   - `Index.html` (use **File → New → HTML file**, name it `Index`)
   - Update `appsscript.json` via **Project Settings → Show "appsscript.json"**,
     then paste this repo's version.
   Copy-paste each file's content directly — no build step needed.
4. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **User accessing the web app** (so each submitter's own
     Google identity is used — recommended if everyone is on the same
     Workspace domain)
   - Who has access: **Anyone within [your domain]**
5. Authorize the requested scopes (Drive, Sheets, Gmail) when prompted —
   this is expected the first time, since the script needs to create
   folders/files and send the approver notification.
6. Copy the deployment's **Web app URL** and share it with the team (pin it
   in Slack/Teams, add to onboarding docs, etc.).
7. Edit `CONFIG.APPROVER_EMAILS` in `Config.gs` inside the Apps Script
   editor to list whoever should be notified of new claims, then
   redeploy (**Deploy → Manage deployments → Edit → New version**).

### Updating the app later

Edit the files in the Apps Script editor (or edit here and re-copy them
over), then **Deploy → Manage deployments → Edit → New version** — the
same URL keeps working.

## Adding or changing supported countries

Edit `COUNTRY_CURRENCY_MAP` in `Config.gs` **and** add a matching row to
the `GGI FX Rates Reference` sheet with the country's local currency and
rate. Both need to stay in sync for a country to work end-to-end.

## Repository layout

```
apps-script/
  Config.gs        Drive/Sheet IDs, approver list, country→currency map
  Code.gs          Form handling: validation, claim codes, FX lookup,
                   folder/file creation, sheet logging, notifications
  Index.html       The claim form UI
  appsscript.json  Apps Script project manifest
FLOW.md            Submission & approval flow, compliance notes
README.md          This file
```
