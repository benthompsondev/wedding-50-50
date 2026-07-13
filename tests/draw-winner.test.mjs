import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDrawReport, chooseWinner, publicWinnerName, readEligibleEntries, runRecordDraw, sha256 } from "../scripts/draw-winner.mjs";

const fixturePath = new URL("./fixtures/draw-entries.csv", import.meta.url);
const fixture = await readFile(fixturePath, "utf8");

describe("draw winner script", () => {
  it("loads, sorts, and hashes a valid draw export", () => {
    const entries = readEligibleEntries(fixture);
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map((entry) => entry.ticketNumber), ["0001", "0002", "0003"]);
    assert.equal(sha256(fixture).length, 64);
  });

  it("selects exactly one requested eligible entry", () => {
    const entries = readEligibleEntries(fixture);
    const winner = chooseWinner(entries, 2);
    assert.equal(winner.ticketNumber, "0003");
  });

  it("builds an auditable report without modifying the source rows", () => {
    const entries = readEligibleEntries(fixture);
    const report = buildDrawReport({
      entries,
      winner: entries[0],
      sourceFile: "fixture.csv",
      sourceFileHash: sha256(fixture),
      drawnAt: "2026-09-03T12:00:00.000Z",
    });

    assert.equal(report.totalEligibleTickets, 3);
    assert.equal(report.totalConfirmedSales, 35);
    assert.equal(report.winnerPrize, 17.5);
    assert.equal(report.winner.ticketNumber, "0001");
  });

  it("rejects duplicate ticket numbers", () => {
    const duplicateCsv = fixture.replace("0003,BT-M7H4P3-ABCD", "0001,BT-M7H4P3-ABCD");
    assert.throws(() => readEligibleEntries(duplicateCsv), /Duplicate ticket number/);
  });

  it("keeps private contact details in the JSON report during the record-friendly draw", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "wedding-draw-test-"));
    const output = { value: "", write(chunk) { this.value += chunk; } };
    try {
      const result = await runRecordDraw(fileURLToPath(fixturePath), {
        reportDirectory: temporaryDirectory,
        waitForInput: false,
        countdownSeconds: 0,
        presentationCycles: 2,
        presentationDelayMs: 0,
        randomIndex: (maximum) => Math.max(0, maximum - 1),
        finalWinnerIndex: 1,
        output,
      });

      assert.equal(result.report.winner.ticketNumber, "0002");
      assert.equal(publicWinnerName(result.report.winner.buyerName), "Avery E.");
      assert.match(output.value, /Winning ticket: 0002/);
      assert.match(output.value, /Winner: Avery E\./);
      assert.doesNotMatch(output.value, /avery@example\.test|BT-M7H4P2-K9QX|555-0100/);
      assert.equal(result.report.winner.buyerEmail, "avery@example.test");
      assert.equal(await readFile(fixturePath, "utf8"), fixture);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
