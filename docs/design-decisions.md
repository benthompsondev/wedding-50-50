# Technical decisions

## Google Workspace as the backend

This is a one-event application with a small trusted admin team. Google Apps Script and Google Sheets provide the pieces the workflow actually needs: a server-side endpoint, private structured records, email delivery, simple reconciliation controls, and printable output.

A larger database and custom admin portal would add more hosting and maintenance than this event needs. The tradeoff is that Apps Script has quotas and a less conventional deployment model, so the repository keeps recovery and operating instructions alongside the code.

## Server-authoritative pricing

The browser calculates the visible amount so the interface responds immediately. Apps Script calculates it again from the entry count and ignores any browser-supplied total.

This prevents a modified request from choosing its own price and keeps the pricing rule in the trusted path.

## Locked writes

Apps Script `LockService` wraps the submission write and downstream refresh work. This reduces the risk of overlapping submissions writing against the same Sheet state or rebuilding partial totals.

## Short duplicate window

The frontend prevents repeated clicks while a submission is in progress. The backend adds a second guard by matching normalized email, jar name, entry count, and e-transfer sender name inside a short time window.

The window is deliberately small. It blocks accidental retries without preventing someone from making another intentional purchase later.

## Fail-safe form availability

The application starts in a checking state and requests a valid aggregate status response. The live form appears only after that check succeeds. A failed or invalid response shows a friendly unavailable state instead of accepting details that may not be saved.

## Aggregate-only public status

The public counter needs totals, not participant records. The endpoint returns numbers and a timestamp only. Names, contact details, messages, payment flags, and internal IDs remain in the private Sheet.

## Physical draw preparation

The system creates one private jar row and one printable slip for every included entry. It checks the slip count against the included entry count, but it never selects a winner.

Keeping the final selection in the physical jar matches the event plan and makes the recorded draw easy for friends and family to understand.

## Public API naming debt

The public response still uses these compatibility fields:

- `confirmedSales`
- `confirmedEntryCount`
- `winnerPrize`
- `paidOrderCount`

The current workflow is clearer when described as:

- `submittedEntryValue`
- `includedEntryCount`
- `estimatedWinnerPrize`
- `includedOrderCount`

Renaming them during a live draw would require coordinated frontend and backend deployment and could interrupt the public counter. The safer plan is to keep the existing fields until the event is over, then support both names temporarily while the portfolio demo is introduced.

## Post-event portfolio demo

After the draw:

1. Disable real submissions.
2. Remove the active payment details.
3. Replace live totals with clearly labelled fake aggregate values.
4. Remove the production Apps Script endpoint from the public configuration.
5. Preserve the interface and architecture for portfolio viewing.
6. Keep the real private Sheet outside GitHub.

Demo mode is intentionally not active while the real draw is running.
