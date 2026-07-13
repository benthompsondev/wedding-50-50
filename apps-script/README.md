# Google Apps Script backend

This folder contains the private Google Apps Script that receives entry requests, maintains the private Google Sheet ledger, sends paid-ticket emails, and exposes only aggregate public status.

## Deploying it

1. Create a new private Google Sheet.
2. Open **Extensions > Apps Script** from that Sheet.
3. Replace the default script with `Code.gs` and replace the manifest with `appsscript.json`.
4. Update the `SITE_CONFIG` values in `Code.gs` with the final sales closing date, draw date, GitHub Pages URL, and wedding website URL.
5. Save, reload the Sheet, and choose **Wedding Draw > Setup Spreadsheet**.
6. Test the menu actions with a clearly marked test order before launch.
7. Choose **Deploy > New deployment > Web app**.
8. Execute the app as the deploying account and allow access to anyone with the link.
9. Copy the web app URL into `src/config.ts` as `appsScriptEndpoint`.

## Sheets created

- `Orders` is the source ledger. It contains names, email addresses, phone numbers, payment status, ticket numbers, and notes. Keep this Sheet private.
- `Summary` contains aggregate operating totals for Ben and Tori.
- `Draw Entries` contains one row per eligible paid ticket. It contains buyer details so it must remain private.
- `Draw Snapshot yyyy-MM-dd HH-mm-ss` sheets are never overwritten. Each snapshot records the eligible rows, totals, and SHA-256 hash used for the final draw record.

## Safe operating order

1. Match an incoming e-transfer to an `Orders` row using the order reference, sender name, amount, and email.
2. Select the matching row on `Orders`.
3. Choose **Wedding Draw > Confirm Selected Order**.
4. Review the assigned zero-padded ticket numbers and confirmation email result.
5. Use **Re-send Confirmation Email** if the original email failed or the buyer asks for it again.
6. Use **Mark Selected Order Refunded** when required. The original ticket numbers remain in `Orders` for audit history, but the order is removed from `Draw Entries` and its ticket numbers are never silently reused.

The public `doGet?action=status` response contains only `confirmedSales`, `confirmedTicketCount`, `winnerPrize`, `paidOrderCount`, and `lastUpdated`. It never returns the Orders sheet, names, email addresses, phone numbers, order IDs, or ticket numbers.

## CORS and testing

Google Apps Script web apps can redirect their response through a Google-hosted URL. The website uses a simple `text/plain` JSON POST to avoid a browser preflight and only shows success when it can read an explicit `{ "ok": true }` response. Test from the deployed GitHub Pages URL, not only from a local file. If the browser reports a CORS or redirect error, do not tell buyers that the order succeeded. Fix the deployment or endpoint configuration first.
