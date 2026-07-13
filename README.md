# Ben & Tori’s Wedding 50/50

We’re skipping the stag and doe and doing one 50/50 for friends and family instead. Entries are $10 each or 3 for $25. Once an e-transfer is confirmed, the guest’s chosen name is added to the private jar list once for every paid entry.

Ben and Tori will print and cut those name slips, mix them in a physical jar, and draw one name on video. The winner gets half the confirmed pot, and the other half helps with the wedding.

## How the project fits together

- `src/` contains the public Vite, React, and TypeScript site.
- `apps-script/` contains the private Google Sheet workflow and email automation.
- `.github/workflows/deploy.yml` tests, builds, and deploys `dist/` through GitHub Pages.

The public site never receives the private ledger. Its status request contains aggregate totals only. The form stays hidden until the configured backend answers with a valid status response. If that check fails, guests see a short try-again message instead of a broken form.

## Local development

Requirements:

- Node.js 22 or newer
- npm

```powershell
npm ci
npm run dev
```

Run the full local checks with:

```powershell
npm test
npm run build
```

Vite writes the production site to `dist/`. The base path is `/wedding-50-50/` so images, scripts, styles, the favicon, and the manifest work at the GitHub Pages project URL.

## Pricing and draw dates

Both the browser and private backend use:

```text
floor(entryCount / 3) * 25 + (entryCount % 3) * 10
```

The backend calculates the amount again and does not trust a total sent by the browser.

Current Toronto times:

```text
Entries close: 2026-08-15T18:00:00-04:00
Draw:          2026-08-15T20:00:00-04:00
```

Keep these values aligned in `src/config.ts` and `apps-script/Code.gs`.

## Public deployment

Pushes to `main` run the **Deploy wedding 50/50 to GitHub Pages** workflow. It installs dependencies, runs the tests, builds the site, uploads `dist/`, and deploys it with the supported GitHub Pages actions.

Public URL: <https://benthompsondev.github.io/wedding-50-50/>

Do not commit `dist/`. GitHub Actions creates it during deployment.

## Private Google Sheet setup

The private Sheet and web app are installed and tested. These steps are kept here for recovery or a future redeployment.

The Sheet contains guest names, contact information, payment state, and internal IDs. Keep it private.

1. Create a new private Google Sheet owned by Ben or Tori.
2. Open **Extensions > Apps Script**.
3. Replace the default script with `apps-script/Code.gs`.
4. Replace the Apps Script manifest with `apps-script/appsscript.json`.
5. Review `SITE_CONFIG` in `Code.gs`.
6. Save the Apps Script project.
7. Reload the Sheet.
8. Choose **Wedding Draw > Setup Spreadsheet**.
9. Approve the first-run permissions from the trusted owner account.
10. Confirm `Orders`, `Summary`, `Jar Entries`, and `Printable Jar Slips` were created.
11. In Apps Script, choose **Deploy > New deployment > Web app**.
12. Run it as the deploying account and allow anyone with the link to access it.
13. Copy the `/exec` URL into `appsScriptEndpoint` in `src/config.ts`.
14. Run one clearly marked test with fake guest details from the deployed site.
15. Verify both emails, the pending row, payment confirmation, jar rows, printable slips, and the aggregate public counter before accepting real entries.

Do not put a Sheet URL, Google credential, API key, or private identifier in the frontend.

## Day-to-day payment workflow

1. A guest chooses 1–99 entries and submits their name and email.
2. The backend saves a `Pending` row and emails the e-transfer address and trusted amount.
3. Match the transfer using the e-transfer sender name, amount, and guest details. Ask the guest directly if the match is unclear.
4. Select the row in `Orders` and choose **Wedding Draw > Confirm Selected Payment**.
5. The row becomes `Paid`, one private `Jar Entries` row is created per entry, and the guest receives a friendly confirmation.

Use **Re-send E-transfer Details** or **Re-send Paid Confirmation** when needed. Refunding a paid row preserves the private history but removes its name slips from `Jar Entries`.

## Preparing the physical jar

After entries close and payments are reconciled:

1. Refresh `Summary` and `Jar Entries`.
2. Check that confirmed sales and the number of jar rows match the paid Orders rows.
3. Choose **Wedding Draw > Create Jar Snapshot** to preserve a private, timestamped copy and hash.
4. Choose **Wedding Draw > Create Printable Jar Slips**.
5. Confirm the alert reports the same number of printable slips and paid entries.
6. Print the `Printable Jar Slips` sheet at 100% scale.
7. Cut every bordered cell into a separate slip.
8. Count the physical slips again, fold them the same way, and place all of them in the jar.
9. Mix the jar thoroughly and record the draw of one name.
10. Contact the winner before adding their first name, last initial, final prize, and video link to `winnerAnnouncement` in `src/config.ts`.

The physical jar is the draw. The spreadsheet prepares and checks the name slips; it does not choose the winner.

## Public status shape

`doGet?action=status` returns only:

```json
{
  "confirmedSales": 0,
  "confirmedEntryCount": 0,
  "winnerPrize": 0,
  "paidOrderCount": 0,
  "lastUpdated": "Not updated yet"
}
```

No names, emails, phone numbers, internal IDs, messages, or individual payment records are public.

## Troubleshooting

- **The form is hidden:** confirm the endpoint is configured, the web app still allows anyone with the link, and `?action=status` returns valid aggregate totals.
- **A submission fails:** check the browser console and Apps Script execution log. Keep it in the error state unless the backend returns `{ "ok": true }`.
- **The Sheet menu is missing:** reload the bound Sheet or run `setupSpreadsheet` once from the Apps Script editor.
- **An email fails:** check MailApp quota and the row’s `Notes` column, then use the matching re-send menu item.
- **The jar count is wrong:** stop, inspect every paid Orders row, correct the private ledger, and refresh `Jar Entries` before printing.
- **GitHub Pages assets fail:** keep `base: "/wedding-50-50/"` in `vite.config.ts`, run a local build, and confirm Pages uses GitHub Actions.

## Launch status

The private Sheet, email flow, payment confirmation, jar rows, printable slips, refund path, and server-side pricing check passed with disposable test data. The fake rows, slips, totals, and test emails were removed before launch.
