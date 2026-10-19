# Stage 1 - Akademi BTC

Web app for **Stage 1 - Academy** of the Boarding Technician Camp (Stage 0 Orientation → Stage 1 Academy → Stage 2 Field Observation, ~30 days each).

It is a Google Apps Script web app. All data lives in Google Drive/Sheets of the account that deploys it (hrd.madinah.reload@gmail.com), inside a folder the developer chooses.

## What it does

| Page | URL | Who | What |
|---|---|---|---|
| Guest | `<web app URL>` | Anyone with the link | **Isi Laporan** (report form) and **Dashboard** (monitoring). `?view=dashboard` opens the dashboard tab, `?batch=<id>` picks a batch. |
| Dev | `<web app URL>?mode=dev` | Password protected | Manage batches, settings, students (santri), device categories & targets, form questions, milestones, and edit or delete any report. Includes a dashboard preview. |

**Dashboard** mirrors the "Report Stage 1 BTC" sheet: per santri Done / Target / Achievement per device type (Android, iPhone, Laptop by default), Akumulasi (Prog. and %), day counter ("Hari ke X / 30"), milestone table (day 5 → 13 units … day 40 → 100 units), a cumulative progress chart against the milestone line, units-per-santri chart, a name filter (Semua / each santri), and recent reports. Each santri is marked "Sesuai target" or "Di bawah target" by comparing their total units with today's milestone value.

**Form** questions are fully editable from the Dev page (text, paragraph, number, date, dropdown, multiple choice, checkboxes, file upload, grouped by section). Four questions are required by the dashboard and can be relabelled or moved but not deleted: date, santri name, device type, units finished. Photos are saved in the batch's `Uploads` folder.

## How batches stay separate

```
<root folder>/
  Akademi BTC Stage 1 - Registry          (list of batches)
  Stage 1 - Akademi BTC - Batch 4/
    Stage 1 - Akademi BTC - Batch 4 - Data (Settings, Categories, Students, FormFields, Milestones, Reports)
    Uploads/
  Stage 1 - Akademi BTC - Batch 5/
    ...
```

Each batch has its own folder and spreadsheet. **Dev → Batch → Buat batch baru** creates the next batch by copying the form, categories, targets, milestones and settings from an existing batch (optionally the santri list too). Reports are never copied, and nothing in an older batch is changed. Old batches can be archived: their dashboard stays viewable, their form closes.

## Deploy (one time, ~10 minutes)

Do this signed in as **hrd.madinah.reload@gmail.com**.

1. Open <https://script.google.com> → **New project**. Name it `Stage 1 - Akademi BTC`.
2. Create files with the same names as in [`apps-script/`](apps-script) and paste their contents:
   - Script files (`+` → Script): `Code`, `Logic`, `Setup`
   - HTML files (`+` → HTML): `Index`, `Dev`, `Styles`, `Shared`
   - Project Settings → tick **Show "appsscript.json" manifest file**, then paste `appsscript.json`.

   (Or with [clasp](https://github.com/google/clasp): copy `.clasp.json.example` to `.clasp.json`, put the script ID in it, then `clasp push`.)
3. Open `Setup.gs` and fill in:
   - `ROOT_FOLDER_ID`: the folder that should hold the data. Open the folder in Drive and copy the part after `/folders/` in the URL. Leave empty to create a folder named "Akademi BTC - Stage 1".
   - `INITIAL_DEV_PASSWORD`: the Dev password (at least 6 characters).
   - `FIRST_BATCH_START`: first day of Stage 1 for Batch 4, as `yyyy-MM-dd`.
4. Choose `setup` in the function dropdown and press **Run**. Approve the permissions (Drive and Sheets). The log shows the folder link.
5. Clear `INITIAL_DEV_PASSWORD` again and save (the password is stored as a hash).
6. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Copy the web app URL.
7. Open `<URL>?mode=dev`, log in, add the santri in **Santri**, check the form in **Form**, and share `<URL>` with the santri.

After changing code later: **Deploy → Manage deployments → edit → Version: New version**, so the URL stays the same.

Time zone is `Asia/Jakarta` (in `appsscript.json`); change it there if needed.

## Development

`apps-script/Logic.gs` holds the dashboard maths, form validation and table cleaning without any Google services, so it runs under Node:

```
npm test
```
