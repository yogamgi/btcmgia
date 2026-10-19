# BTC - Boarding Technician Camp

Web app for the Boarding Technician Camp stages: **Stage 0 - Orientasi**, **Stage 1 - Akademi** and **Stage 2 - Asistensi** (~30 days each).

It is a Google Apps Script web app. All data lives in Google Drive/Sheets of the account that deploys it (hrd.madinah.reload@gmail.com), inside a folder the developer chooses.

## What it does

| Page | URL | Who | What |
|---|---|---|---|
| Guest | `<web app URL>` | Anyone with the link | Stage picker. Open stages show **Isi Laporan** (report form) and **Dashboard**; locked stages cannot be opened. `?stage=stage0` or `?stage=stage1` opens a stage directly, `&view=dashboard` opens its dashboard, `?batch=<id>` picks a batch. |
| Dev | `<web app URL>?mode=dev` | Password protected | **Batch**, **Umum** (santri list shared by all stages, banner), and one area per stage: name, description, lock/unlock, form questions, reports, and a dashboard preview (also while locked). Stage 1 also has settings, device categories & targets, and milestones. |

**Stages.** Each stage is either open or locked (`Stages` sheet). A new batch starts with Stage 0 open and Stages 1 and 2 locked. Stage 2 has no form yet; when unlocked, guests see "Segera hadir".

**Stage 0 - Orientasi** form: santri name, branch (dropdown), activities (checkboxes), documentation upload. Its dashboard counts reports per santri, shows when each santri last reported, and tallies branches and activities. Picking a santri shows only their own reports.

**Stage 1 - Akademi** dashboard mirrors the "Report Stage 1 BTC" sheet: per santri Done / Target / Achievement per device type (Android, iPhone, Laptop by default), Akumulasi (Prog. and %), day counter ("Hari ke X / 30"), milestone table (day 5 → 13 units … day 40 → 100 units), a cumulative progress chart against the milestone line, and a units-per-santri chart. Each report counts as one unit. Picking a santri shows only their own reports. Each santri is marked "Sesuai target" or "Di bawah target" by comparing their total units with today's milestone value.

**Form** questions are fully editable from the Dev page (text, paragraph, number, date, dropdown, multiple choice, checkboxes, file upload, grouped by section). The questions a dashboard depends on (Stage 1: date, santri name, device type; Stage 0: santri name) can be relabelled or moved but not deleted. Photos are saved in the batch's `Uploads` folder.

## How batches stay separate

```
<root folder>/
  Akademi BTC Stage 1 - Registry          (list of batches)
  Stage 1 - Akademi BTC - Batch 4/
    Stage 1 - Akademi BTC - Batch 4 - Data (Students, Stages, S0_FormFields, S0_Reports,
                                            Settings, Categories, FormFields, Milestones, Reports)
    Uploads/
  Stage 1 - Akademi BTC - Batch 5/
    ...
```

Each batch has its own folder and spreadsheet. **Dev → Batch → Buat batch baru** creates the next batch by copying every stage's form, the stage names, categories, targets, milestones and settings from an existing batch (optionally the santri list too). Reports are never copied, and nothing in an older batch is changed. Old batches can be archived: their dashboard stays viewable, their form closes.

## Deploy (one time)

Do this signed in as **hrd.madinah.reload@gmail.com**.

1. Open <https://script.google.com> → **New project**. Rename it `Stage 1 - Akademi BTC`.
2. Replace everything in `Code.gs` with the contents of [`dist/Code.gs`](dist/Code.gs) (the whole app in one file) and press **Save** (Ctrl+S).
3. **Deploy → New deployment** → gear icon → **Web app**. Execute as: **Me**. Who has access: **Anyone**. Press **Deploy**, then **Authorize access** and allow Drive and Sheets (on "Google hasn't verified this app" choose **Advanced → Go to … (unsafe)**; it is your own script).
4. Open the **Web app URL** while signed in as the same account. The first visit shows a setup form: paste the Drive folder link for the data (or leave it empty), the first batch name (Batch 4), its start date, and the Dev password.
5. On the Dev page (`<URL>?mode=dev`) add the santri in **Santri**, check the questions in **Form**, then share `<URL>` with the santri.

After changing code later: run `npm run build`, paste `dist/Code.gs` again, then **Deploy → Manage deployments → edit → Version: New version**, so the URL stays the same.

Alternatives: keep the multi-file layout with [clasp](https://github.com/google/clasp) (`.clasp.json.example`, `clasp push`), or run `setup()` from the editor after filling in `SETUP` in `SetupCode.gs`.

The script's time zone follows the account's default; set it to `Asia/Jakarta` in Project Settings if it differs.

## Development

`apps-script/Logic.gs` holds the dashboard maths, form validation and table cleaning without any Google services, so it runs under Node:

```
npm test        # logic tests
npm run build   # regenerate dist/Code.gs
```
