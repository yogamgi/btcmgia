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

## Deploy (one time)

Do this signed in as **hrd.madinah.reload@gmail.com**.

1. Open <https://script.google.com> → **New project**. Rename it `Stage 1 - Akademi BTC`.
2. Replace everything in `Code.gs` with the contents of [`dist/Code.gs`](dist/Code.gs) (the whole app in one file) and press **Save** (Ctrl+S).
3. **Deploy → New deployment** → gear icon → **Web app**. Execute as: **Me**. Who has access: **Anyone**. Press **Deploy**, then **Authorize access** and allow Drive and Sheets (on "Google hasn't verified this app" choose **Advanced → Go to … (unsafe)**; it is your own script).
4. Open the **Web app URL** while signed in as the same account. The first visit shows a setup form: paste the Drive folder link for the data (or leave it empty), the first batch name (Batch 4), its start date, and the Dev password.
5. On the Dev page (`<URL>?mode=dev`) add the santri in **Santri**, check the questions in **Form**, then share `<URL>` with the santri.

After changing code later: run `npm run build`, paste `dist/Code.gs` again, then **Deploy → Manage deployments → edit → Version: New version**, so the URL stays the same.

Alternatives: keep the multi-file layout with [clasp](https://github.com/google/clasp) (`.clasp.json.example`, `clasp push`), or run `setup()` from the editor after filling in `SETUP` in `Setup.gs`.

The script's time zone follows the account's default; set it to `Asia/Jakarta` in Project Settings if it differs.

## Development

`apps-script/Logic.gs` holds the dashboard maths, form validation and table cleaning without any Google services, so it runs under Node:

```
npm test        # logic tests
npm run build   # regenerate dist/Code.gs
```
