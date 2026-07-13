# Private Apps Script backend

This bound Google Apps Script receives form submissions, keeps the private payment ledger, sends both emails, expands paid entries into name slips, and exposes aggregate totals to the public site.

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
- `Jar Entries` contains one row per eligible paid entry.
- `Printable Jar Slips` contains only the names to print and cut.
- `Jar Snapshot ...` sheets preserve timestamped private copies and a hash.

Keep the spreadsheet and all exports private.

## Safe operating order

1. Match the incoming e-transfer to a pending row using sender name, amount, and guest details.
2. Select that row in `Orders`.
3. Choose **Confirm Selected Payment**.
4. Confirm that the paid email was sent and `Jar Entries` grew by the expected count.
5. Use the re-send menu items if an email failed.
6. Use **Mark Selected Payment Refunded** when required. The Orders history remains, but those slips leave the eligible jar list.

Before the draw, refresh the summary and jar rows, create a snapshot, then create the printable slips. The script checks that printable names equal eligible paid entries before and after it writes the sheet.

The website status response includes only `confirmedSales`, `confirmedEntryCount`, `winnerPrize`, `paidOrderCount`, and `lastUpdated`.

The backend recalculates pricing with `floor(entryCount / 3) * 25 + (entryCount % 3) * 10`. A browser-supplied total is ignored.
