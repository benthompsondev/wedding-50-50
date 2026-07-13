# Ben & Tori’s Wedding 50/50

This is a small, one-time wedding 50/50 for friends and family. The public site explains the draw and collects an entry request. Payment happens separately through Interac e-transfer. A private Google Sheet tracks orders and paid ticket numbers, and a Node.js script creates an auditable final draw report from an exported `Draw Entries` CSV.

The winner receives 50% of all confirmed ticket sales. The remaining 50% supports Ben and Tori’s wedding.

## 1. Project overview

The project deliberately has three small pieces:

- `src/` is a static Vite + React + TypeScript site for buyers.
- `apps-script/` is the private Google Apps Script and spreadsheet workflow for Ben and Tori.
- `scripts/draw-winner.mjs` is the local final-draw tool. It reads a CSV, validates it, uses `crypto.randomInt`, and writes a timestamped JSON report without modifying the CSV.

The site does not create accounts, collect card details, or expose the private order ledger. If the public Apps Script status endpoint is unavailable, the page shows the honest fallback: “The final prize will be 50% of all confirmed ticket sales.”

## 2. Local development

Requirements:

- Node.js 22 or newer
- npm

Install and start the site:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The form intentionally does not show a fake success while `appsScriptEndpoint` is blank. That is expected until the private backend is deployed.

## 3. Production build

Run the same checks used by GitHub Actions:

```powershell
npm test
npm run build
```

The production files are written to `dist/`. `vite.config.ts` sets the base path to `/wedding-50-50/` so the built assets work from the project’s GitHub Pages URL.

## 4. Image selection and optimization

The original photos stay in Ben’s Pictures folder and are not modified. The site uses compact public copies under `public/images`:

- `hero-pumpkin.jpg` is the warm landscape hero with the October date visible.
- `social-preview.jpg` is the clear horizontal portrait used for Facebook and Open Graph sharing.
- `family-lily.jpg` is the personal section image featuring Ben, Tori, and Lily.
- The remaining gallery files keep the site personal without loading the original full-size files.

The current public copies are JPEGs or the already-small WebP image, and the social preview is under 1 MB. If new photos are added, resize them for the web, preserve natural skin tones, write meaningful alt text, and confirm that the share preview still reads well on a phone.

## 5. GitHub Pages deployment

`.github/workflows/deploy.yml` builds and deploys from the `main` branch. The workflow runs tests and a production build before uploading `dist/` to GitHub Pages.

One-time GitHub setup:

1. Create or connect the GitHub repository.
2. Push the project to the `main` branch after reviewing the privacy checklist.
3. In the repository, open **Settings > Pages**.
4. Set the source to **GitHub Actions**.
5. Wait for the **Deploy wedding 50/50 to GitHub Pages** workflow to finish.

Do not use the final public link until the configuration values are updated and a real test order has been completed.

## 6. Updating the site URL

The public site URL is set to `https://benthompsondev.github.io/wedding-50-50/` in:

- `src/config.ts`
- `index.html` canonical and Open Graph URL tags
- `apps-script/Code.gs` `SITE_CONFIG.publicWebsiteUrl`

If the repository URL changes, update those values before deploying the Apps Script backend. Keep the `/wedding-50-50/` Vite base path for this repository.

## 7. Configuring the draw closing date

Replace `TODO_DRAW_CLOSING_DATE` in both `src/config.ts` and `apps-script/Code.gs` with an ISO timestamp that includes the Toronto offset, for example:

```text
2026-10-09T23:59:59-04:00
```

The page will then show the closing date and countdown, and it will stop accepting entries after that time. Confirm the real deadline before launch rather than copying the example.

## 8. Configuring the draw date

Replace `TODO_DRAW_DATE` in both config files with the final draw date and time, including the Toronto offset. The site will show the date in the draw details and the paid-ticket confirmation email will use the same value.

## 9. Creating the Google Sheet

1. Create a private Google Sheet owned by Ben or Tori.
2. Open **Extensions > Apps Script**.
3. Add `apps-script/Code.gs` and `apps-script/appsscript.json`.
4. Save the Apps Script project.
5. Reload the Sheet.
6. Open the new **Wedding Draw** menu.

The first setup creates `Orders`, `Summary`, and `Draw Entries`. Do not make this Sheet public.

## 10. Installing the Apps Script

Copy the complete contents of `apps-script/Code.gs` into the bound Apps Script project. Copy the manifest values from `apps-script/appsscript.json` into the project manifest. Update `SITE_CONFIG` before deploying.

The web app runs as the deploying account and accepts anonymous requests so the public static site can submit an entry. The Sheet itself remains private. The web app response is intentionally small and never returns the spreadsheet contents.

## 11. Running Setup Spreadsheet

From the bound Google Sheet:

1. Reload the Sheet.
2. Choose **Wedding Draw > Setup Spreadsheet**.
3. Approve the first-run Google permissions using the trusted owner account.
4. Confirm that the three expected sheets and headers exist.

Run setup before accepting public orders. If an existing sheet has unexpected headers, stop and correct it instead of letting the script rewrite a live ledger.

## 12. Deploying the Apps Script web app

1. In Apps Script choose **Deploy > New deployment**.
2. Select **Web app**.
3. Set **Execute as** to the deploying account.
4. Set access to anyone with the link.
5. Deploy and copy the web app URL.

Paste that URL into `src/config.ts` as `appsScriptEndpoint`, rebuild, and test from the deployed GitHub Pages URL. The site only shows success when it receives `{ "ok": true }` from the backend.

## 13. Adding the endpoint to `src/config.ts`

Set:

```ts
appsScriptEndpoint: "https://script.google.com/macros/s/your-deployment-id/exec",
```

Do not put a private Sheet URL, service-account key, API key, or secret in the frontend config. The Apps Script web app URL is a public endpoint by design, so the server-side validation and the small response shape matter.

## 14. Testing a form submission

Use a test name and a safe test email. Submit from the deployed site and confirm:

- the form button disables while the request is in flight;
- a duplicate click cannot create a second request;
- the success screen shows the order reference and exact amount;
- the `Orders` row is `Pending`;
- no ticket number is assigned yet;
- the browser shows an error, not success, if the endpoint rejects the request.

Do not use real guest information during the first test.

## 15. Matching an e-transfer to an order

Use the order reference in the transfer message first. Cross-check the sender name, amount, and email from the order. If the reference is missing, use the sender name and amount plus a direct confirmation with the buyer. Do not guess when two orders could match.

## 16. Confirming a paid order

On the `Orders` sheet, select the order row and choose **Wedding Draw > Confirm Selected Order**. The script checks the package and server-calculated amount, assigns the next available ticket numbers, marks the row `Paid`, refreshes the private summary, refreshes `Draw Entries`, and sends the confirmation email.

The confirmation email is sent only after the row is marked `Paid`. If email sending fails, the payment state remains auditable and the row note explains the failure so you can use the re-send action.

## 17. Assigning ticket numbers

Ticket numbers are four digits, starting at `0001`. The script scans every existing order, including refunded orders, before assigning the next number. That means a refunded number is never silently reused.

The public site never receives ticket numbers. They are sent only to the buyer’s email after payment is confirmed.

## 18. Re-sending an email

Select the already-paid row on `Orders` and choose **Wedding Draw > Re-send Confirmation Email**. This action does not create or change ticket numbers.

## 19. Marking a refund

Select the paid order and choose **Wedding Draw > Mark Selected Order Refunded**. The script keeps the original payment confirmation time and ticket numbers in `Orders` for audit history, changes the status to `Refunded`, removes the tickets from `Draw Entries`, and updates the summary. Refunded tickets are not eligible for the draw.

## 20. Viewing the public jackpot

The site requests `?action=status` from the Apps Script endpoint. The response contains only:

```json
{
  "confirmedSales": 0,
  "confirmedTicketCount": 0,
  "winnerPrize": 0,
  "paidOrderCount": 0,
  "lastUpdated": "Not updated yet"
}
```

Those zero values are what a configured, empty ledger returns. Before the endpoint is configured, the site does not display fake totals and instead uses its fallback sentence.

## 21. Creating a draw snapshot

When sales close and all payments are reconciled:

1. Choose **Wedding Draw > Create Draw Snapshot**.
2. Confirm the new timestamped snapshot sheet is present.
3. Record the SHA-256 hash shown in the alert.
4. Do not edit or delete previous snapshots.

The snapshot freezes the eligible entries, totals, and hash used for the final draw.

## 22. Exporting Draw Entries

Open the private `Draw Entries` sheet after the snapshot is created. Export only the current eligible rows as CSV. Keep the export private while the draw is being conducted. The export should include the headers written by the script, especially `Ticket Number`, `Order ID`, `Buyer Name`, `Buyer Email`, and `Buyer Phone`.

## 23. Running the winner script

From the project root, run:

```powershell
npm run draw -- .\path\to\draw-entries.csv
```

The script rejects an empty file, missing headers, blank or malformed numbers, and duplicate ticket numbers. It sorts the ticket numbers, hashes the original CSV bytes, uses Node’s `crypto.randomInt`, prints the winning ticket and buyer details, and writes a new JSON report under `draw-reports/`.

For a test run without using the default report folder:

```powershell
npm run draw -- .\tests\fixtures\draw-entries.csv --report-dir .\draw-reports-test
```

Never edit the source CSV during the draw. The script only reads it.

## 24. Recording the final draw

Keep the JSON report with the private draw records. Record the snapshot sheet name, source file hash, draw date and time, winning ticket, and winner contact outcome. The report includes the winner’s full contact details for Ben and Tori’s private use.

## 25. Publishing the winner

After the winner has been contacted, update `winnerAnnouncement` in `src/config.ts` with the first name, last initial, winning ticket number, and final prize amount. Set `announced` to `true`, run tests and a production build, and publish only after checking that no private email, phone number, order ID, or spreadsheet data was added to the public config.

## 26. Troubleshooting

### The page shows the fallback prize text

That is expected when `appsScriptEndpoint` is blank or the public status request fails. Confirm the endpoint URL, deployment access, and `doGet?action=status` response. Never replace the fallback with a manually typed total.

### The form will not show success

Check the browser console and Apps Script execution log. The site needs a readable JSON response with `ok: true`. A rejected request, a CORS/redirect problem, an invalid package, a duplicate order ID, or a missing required field must remain an error.

### The Sheet menu is missing

Reload the bound Sheet and confirm that `onOpen` exists in the Apps Script project. Run `setupSpreadsheet` once from the Apps Script editor if the menu has not been created yet.

### The confirmation email did not arrive

Check the address, Apps Script MailApp quota, and the `Confirmation Sent` and `Notes` columns. The order should remain `Paid` with its ticket numbers. Use the re-send menu action after fixing the cause.

### A ticket is missing from the draw export

Refresh `Draw Entries` after confirming or refunding orders. Only `Paid` rows are eligible. Create a fresh snapshot before exporting again.

### GitHub Pages assets are broken

Run `npm run build` and inspect `dist/`. Keep `base: "/wedding-50-50/"` in `vite.config.ts`, upload the contents of `dist/`, and verify that the GitHub Pages source is set to GitHub Actions.

## Remaining manual setup

The code is ready for the setup sequence, but the following values are intentionally left for Ben and Tori to decide:

- final sales closing date;
- final draw date;
- public GitHub Pages URL;
- deployed Google Apps Script web app URL;
- final winner details after the draw.

Do not publish or perform the final draw until those values and the complete test order have been checked.
