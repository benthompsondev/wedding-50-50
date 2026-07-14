# Operations

This document covers the private day-to-day workflow for the live draw. It intentionally does not include private Sheet links, participant details, or account information.

## Daily reconciliation

1. Review new `Included` rows in the private Orders sheet.
2. Match each e-transfer using the sender name, amount, and participant details.
3. Check **Payment Received** when the transfer arrives.
4. Confirm the payment timestamp is filled automatically.
5. Use **Wedding Draw > Refresh Everything** if a manual reconciliation is needed.

The payment checkbox updates the private payment summary. It does not control whether an `Included` submission appears in the current jar list.

## Missing or returned payments

- Change **Entry Status** to `Cancelled` when payment never arrives.
- Use `Refunded` when money was returned.

Status changes rebuild Summary, Jar Entries, and Printable Jar Slips. Cancelled and refunded entries are removed from the public totals and current draw materials.

## Wedding Draw menu

- **Refresh Everything** rebuilds Summary, Jar Entries, and Printable Jar Slips.
- **Mark Selected Entry Cancelled** changes the selected order and rebuilds the workflow.
- **Mark Selected Entry Refunded** records a returned payment and rebuilds the workflow.
- **Re-send E-transfer Details** sends the original payment instructions again.
- **Create Jar Snapshot** preserves a private timestamped draw-day record.
- **Create Printable Jar Slips** rebuilds and checks the final print layout.

## Troubleshooting

- **The public form is unavailable:** confirm the web app still allows anonymous access and that the aggregate status request returns valid JSON.
- **A submission fails:** inspect the browser console and Apps Script execution log. Do not assume the row was saved unless the backend returned success.
- **The Sheet menu is missing:** reload the bound Sheet or run the setup function once from the Apps Script editor.
- **An email fails:** check MailApp quota and the row Notes field, then use the re-send action.
- **The jar count is wrong:** stop, inspect every Included row, correct the private ledger, and run **Refresh Everything** before printing.
- **GitHub Pages assets fail:** confirm the Vite base path, run a local build, and confirm Pages still uses GitHub Actions.

## Privacy boundary

Never share screenshots of the Orders sheet, Apps Script management pages, account sessions, or participant records. Public troubleshooting should use aggregate counts and fake examples only.
