# Private Apps Script backend

This bound Google Apps Script receives form submissions, keeps the private payment ledger, sends e-transfer details, expands Included entries into name slips, and exposes aggregate totals to the public site.

## Install

1. Create a new private Google Sheet.
2. Open **Extensions > Apps Script**.
3. Copy in `Code.gs` and `appsscript.json`.
4. Review `SITE_CONFIG`.
5. Save and reload the Sheet.
6. Choose **Wedding Draw > Setup Spreadsheet**.
7. Deploy as a web app that runs as the owner and allows anyone with the link.
8. Put the `/exec` URL in `src/config.ts` only after the private workflow passes a fake-data test.

## Private sheets

- `Orders` is the source ledger. It contains contact and payment information.
- `Summary` contains operating totals.
- `Jar Entries` contains one row per Included entry.
- `Printable Jar Slips` contains only the names to print and cut.
- `Jar Snapshot ...` sheets preserve timestamped private copies and a hash.

Keep the spreadsheet and all exports private.

## Safe operating order

1. New submissions enter the current draw as `Included` and create their jar rows and printable slips immediately.
2. Match the incoming e-transfer using `Name for Jar`, `E-transfer Name`, amount, and email or phone if clarification is needed.
3. Check **Payment Received**. The timestamp and Summary update automatically.
4. Use **Re-send E-transfer Details** if the first email failed.
5. Mark an entry `Cancelled` if payment never arrives, or `Refunded` if money was returned. The Orders history stays private and those slips leave the current draw.

Before the draw, reconcile every payment, run **Refresh Everything**, create a private jar snapshot, and create the printable slips. Verify the counts, then print, cut, and fold every slip the same way. Record the physical draw, contact the winner, and add the winner details and video URL to the site.

The script checks that printable names equal Included entries before and after it writes the sheet.

The website status response includes only `confirmedSales`, `confirmedEntryCount`, `winnerPrize`, `paidOrderCount`, and `lastUpdated`.

The backend recalculates pricing with `floor(entryCount / 3) * 25 + (entryCount % 3) * 10`. A browser-supplied total is ignored.
