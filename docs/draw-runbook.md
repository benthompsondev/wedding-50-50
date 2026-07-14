# Physical draw runbook

The spreadsheet prepares and checks the name slips. It does not choose the winner.

## Before entries close

1. Reconcile outstanding e-transfers.
2. Cancel entries that should not remain in the draw.
3. Record refunds with the `Refunded` status.
4. Confirm the public totals agree with the private Included rows.

## Prepare the jar

1. Run **Wedding Draw > Refresh Everything**.
2. Confirm submitted value and jar-row count match the Included Orders rows.
3. Choose **Wedding Draw > Create Jar Snapshot**.
4. Choose **Wedding Draw > Create Printable Jar Slips**.
5. Confirm the alert reports the same number of printable slips and included entries.
6. Print `Printable Jar Slips` at 100% scale.
7. Cut every bordered cell into a separate slip.
8. Count the physical slips and compare the count with the private summary.
9. Fold every slip the same way and place them in the jar.

## Record the draw

1. Start the video before mixing the jar.
2. Show the closed jar and the mixing process clearly.
3. Mix the slips thoroughly.
4. Draw one slip without looking inside the jar.
5. Read the selected name on video.
6. Preserve the video and private snapshot.
7. Contact the winner directly before publishing their first name and last initial.

## Publish the result

Update `winnerAnnouncement` in `src/config.ts` with the first name, last initial, final prize, and draw-video link. Run the full test and build checks before deploying that update.
