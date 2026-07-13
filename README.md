# Ben & Tori’s Wedding 50/50

This is a small, one-time wedding 50/50 for friends and family. The public site explains the draw and collects an entry request when the private Apps Script endpoint is connected. Tickets are $10 each or 3 for $25, repeating for every group of three. Payment happens separately through Interac e-transfer. A private Google Sheet tracks orders and paid ticket numbers, and a Node.js script creates an auditable final draw report from an exported `Draw Entries` CSV.

The winner receives 50% of all confirmed ticket sales. The remaining 50% supports Ben and Tori’s wedding.

## 1. Project overview

The project deliberately has three small pieces:

- `src/` is a static Vite + React + TypeScript site for buyers.
- `apps-script/` is the private Google Apps Script and spreadsheet workflow for Ben and Tori.
- `scripts/draw-winner.mjs` is the local final-draw tool. It reads a CSV, validates it, uses `crypto.randomInt`, and writes a timestamped JSON report without modifying the CSV.

The site does not create accounts, collect card details, or expose the private order ledger. Until the Apps Script endpoint is added to `src/config.ts`, the public page stays in preview mode and shows “Tickets opening soon” instead of accepting a request.

## 2. Local development

Requirements:

- Node.js 22 or newer
- npm

Install and start the site:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The form intentionally stays hidden while `appsScriptEndpoint` is blank. The ticket picker remains available so the page can be checked without creating a false order.

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
- `social-preview.jpg` is a 1200x630 horizontal share card with the draw details readable over the park photo.
- `family-lily.jpg` is the personal section image featuring Ben, Tori, and Lily.
- The remaining gallery files keep the site personal without loading the original full-size files.

The current public copies are JPEGs or the already-small WebP image, and the social preview is under 1 MB. If new photos are added, resize them for the web, preserve natural skin tones, write meaningful alt text, and confirm that the share preview still reads well on a phone.

## 5. GitHub Pages deployment

`.github/workflows/deploy.yml` builds and deploys from the `main` branch. The workflow runs tests and a production build before uploading `dist/` to GitHub Pages.

The repository is configured to deploy from GitHub Actions:

1. Push the project to the `main` branch after reviewing the privacy checklist.
2. Confirm the Pages source is **GitHub Actions** if GitHub has not already selected it.
3. Wait for the **Deploy wedding 50/50 to GitHub Pages** workflow to finish.

Do not use the final public link until the configuration values are updated and a real test order has been completed.

## 6. Updating the site URL

The public site URL is set to `https://benthompsondev.github.io/wedding-50-50/` in:

- `src/config.ts`
- `index.html` canonical and Open Graph URL tags
- `apps-script/Code.gs` `SITE_CONFIG.publicWebsiteUrl`

If the repository URL changes, update those values before deploying the Apps Script backend. Keep the `/wedding-50-50/` Vite base path for this repository.

## 7. Draw timing

The current Toronto timestamps are configured in both `src/config.ts` and `apps-script/Code.gs`:

```text
Sales close: 2026-08-15T18:00:00-04:00
Draw:        2026-08-15T20:00:00-04:00
```

The page shows both dates in America/Toronto time and stops accepting entries after the sales close time.

## 8. Creating the Google Sheet

1. Create a private Google Sheet owned by Ben or Tori.
2. Open **Extensions > Apps Script**.
3. Add `apps-script/Code.gs` and `apps-script/appsscript.json`.
4. Save the Apps Script project.
5. Reload the Sheet.
6. Open the new **Wedding Draw** menu.

The first setup creates `Orders`, `Summary`, and `Draw Entries`. Do not make this Sheet public.

## 9. Installing the Apps Script

Copy the complete contents of `apps-script/Code.gs` into the bound Apps Script project. Copy the manifest values from `apps-script/appsscript.json` into the project manifest. Update `SITE_CONFIG` before deploying.

The web app runs as the deploying account and accepts anonymous requests so the public static site can submit an entry. The Sheet itself remains private. The web app response is intentionally small and never returns the spreadsheet contents.

## 10. Running Setup Spreadsheet

From the bound Google Sheet:

1. Reload the Sheet.
2. Choose **Wedding Draw > Setup Spreadsheet**.
3. Approve the first-run Google permissions using the trusted owner account.
4. Confirm that the three expected sheets and headers exist.

Run setup before accepting public orders. If an existing sheet has unexpected headers, stop and correct it instead of letting the script rewrite a live ledger.

## 11. Deploying the Apps Script web app

1. In Apps Script choose **Deploy > New deployment**.
2. Select **Web app**.
3. Set **Execute as** to the deploying account.
4. Set access to anyone with the link.
5. Deploy and copy the web app URL.

Paste that URL into `src/config.ts` as `appsScriptEndpoint`, rebuild, and test from the deployed GitHub Pages URL. The site only shows success when it receives `{ "ok": true }` from the backend.

## 12. Adding the endpoint to `src/config.ts`

Set:

```ts
appsScriptEndpoint: "https://script.google.com/macros/s/your-deployment-id/exec",
```

Do not put a private Sheet URL, service-account key, API key, or secret in the frontend config. The Apps Script web app URL is a public endpoint by design, so the server-side validation and the small response shape matter.

## 13. Testing a form submission

Use a test name and a safe test email. Submit from the deployed site and confirm:

- the form button disables while the request is in flight;
- a duplicate click cannot create a second request;
- the success screen shows the order reference and exact amount;
- the `Orders` row is `Pending`;
- no ticket number is assigned yet;
- the browser shows an error, not success, if the endpoint rejects the request.

Do not use real guest information during the first test.

## 14. Matching an e-transfer to an order

Use the order reference in the transfer message first. Cross-check the sender name, amount, and email from the order. If the reference is missing, use the sender name and amount plus a direct confirmation with the buyer. Do not guess when two orders could match.

## 15. Confirming a paid order

On the `Orders` sheet, select the order row and choose **Wedding Draw > Confirm Selected Order**. The script checks the package and server-calculated amount, assigns the next available ticket numbers, marks the row `Paid`, refreshes the private summary, refreshes `Draw Entries`, and sends the confirmation email.

The payment-instructions email is attempted immediately after a valid request is saved. If it fails, the order still saves as `Pending`, the failure is written to `Notes`, and **Re-send Payment Instructions** is available. The paid confirmation email is sent only after the row is marked `Paid`.

## 16. Assigning ticket numbers

Ticket numbers are four digits, starting at `0001`. The script scans every existing order, including refunded orders, before assigning the next number. That means a refunded number is never silently reused.

The public site never receives ticket numbers. They are sent only to the buyer’s email after payment is confirmed.

## 17. Re-sending an email

Select an order on `Orders` and choose **Wedding Draw > Re-send Payment Instructions** if the first payment email failed or the buyer asks for it again. For a paid order, use **Re-send Confirmation Email** for the ticket-number email.

Select the already-paid row on `Orders` and choose **Wedding Draw > Re-send Confirmation Email**. This action does not create or change ticket numbers.

## 18. Marking a refund

Select the paid order and choose **Wedding Draw > Mark Selected Order Refunded**. The script keeps the original payment confirmation time and ticket numbers in `Orders` for audit history, changes the status to `Refunded`, removes the tickets from `Draw Entries`, and updates the summary. Refunded tickets are not eligible for the draw.

## 19. Viewing the public prize counter

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

Those zero values are what a configured, empty ledger returns. Before the endpoint is configured, the site stays in preview mode and does not display live totals or accept requests.

## 20. Creating a draw snapshot

When sales close and all payments are reconciled:

1. Choose **Wedding Draw > Create Draw Snapshot**.
2. Confirm the new timestamped snapshot sheet is present.
3. Record the SHA-256 hash shown in the alert.
4. Do not edit or delete previous snapshots.

The snapshot freezes the eligible entries, totals, and hash used for the final draw.

## 21. Exporting Draw Entries

Open the private `Draw Entries` sheet after the snapshot is created. Export only the current eligible rows as CSV. Keep the export private while the draw is being conducted. The export should include the headers written by the script, especially `Ticket Number`, `Order ID`, `Buyer Name`, `Buyer Email`, and `Buyer Phone`.

## 22. Running the winner script

From the project root, run the record-friendly version:

```powershell
npm run draw:record -- .\path\to\draw-entries.csv
```

The script validates and hashes the source CSV, waits for Enter, counts down, shows a shuffled public-safe presentation using first name plus last initial, then uses Node’s `crypto.randomInt` for the final ticket. Full contact details are kept only in the timestamped JSON report under `draw-reports/`.

For a test run without using the default report folder:

```powershell
node scripts/draw-winner.mjs --record .\tests\fixtures\draw-entries.csv --report-dir .\draw-reports-test
```

Never edit the source CSV during the draw. The script only reads it.

## 23. Recording the final draw

Keep the JSON report with the private draw records. Record the snapshot sheet name, source file hash, draw date and time, winning ticket, and winner contact outcome. The report includes the winner’s full contact details for Ben and Tori’s private use.

## 24. Publishing the winner

After the winner has been contacted, update `winnerAnnouncement` in `src/config.ts` with the first name, last initial, winning ticket number, and final prize amount. Set `announced` to `true`, run tests and a production build, and publish only after checking that no private email, phone number, order ID, or spreadsheet data was added to the public config.

## 25. Troubleshooting

### The page shows the fallback prize text

That is expected while `appsScriptEndpoint` is blank. Confirm the endpoint URL, deployment access, and `doGet?action=status` response after the private backend is deployed. Never replace the public total with a manually typed number.

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

The code is ready for the setup sequence. These are the remaining manual steps:

- create the private Sheet and copy in `apps-script/Code.gs`;
- run **Wedding Draw > Setup Spreadsheet**;
- deploy the Apps Script web app and put its `/exec` URL in `src/config.ts` as `appsScriptEndpoint`;
- rebuild and run one clearly marked test order with fake buyer details;
- after the real draw, update only the public winner fields in `winnerAnnouncement`.

The GitHub Pages URL and draw dates are already configured. Do not use real guest details for the test order.
