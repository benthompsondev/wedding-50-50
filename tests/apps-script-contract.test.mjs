import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../apps-script/appsscript.json", import.meta.url), "utf8"),
);
const context = vm.createContext({ Date, JSON, Math, Number, Object, RegExp, String });

vm.runInContext(
  `${source}\nthis.__helpers = {
    calculateAmountForEntryCount_,
    validateSubmission_,
    buildJarEntryRows_,
    buildPrintableSlipGrid_,
    countPrintableSlips_,
    calculateSummary_,
    buildPublicStatus_,
    normalizeEntryStatus_,
    migrateLegacyOrderRow_,
    findRecentDuplicate_,
  };`,
  context,
);

const helpers = context.__helpers;
const includedRecord = (overrides = {}) => ({
  submittedAt: new Date("2026-07-10T12:00:00-04:00"),
  internalOrderId: "BT-ABC123-TEST",
  jarName: "Sample Guest",
  email: "sample@example.test",
  phone: "",
  eTransferName: "Sample Guest",
  entryCount: 4,
  amountDue: 35,
  message: "",
  entryStatus: "Included",
  paymentReceived: false,
  paymentReceivedAt: "",
  paymentInstructionsSent: "Yes",
  ...overrides,
});

describe("Apps Script physical jar contract", () => {
  it("uses the authoritative quantity formula", () => {
    const expected = new Map([
      [1, 10], [2, 20], [3, 25], [4, 35], [5, 45],
      [6, 50], [9, 75], [12, 100], [99, 825],
    ]);
    for (const [quantity, amount] of expected) {
      assert.equal(helpers.calculateAmountForEntryCount_(quantity), amount);
    }
    for (const invalid of [0, 100, 1.5, "abc", ""]) {
      assert.equal(helpers.calculateAmountForEntryCount_(invalid), 0);
    }
  });

  it("ignores any browser-supplied total", () => {
    const payload = helpers.validateSubmission_(
      {
        internalOrderId: "BT-ABC124-TEST",
        jarName: "Sample Guest",
        email: "sample@example.test",
        phone: "",
        eTransferName: "Sample Guest",
        entryCount: 6,
        amountDue: 1,
        message: "",
        honeypot: "",
      },
      new Date("2026-07-10T12:00:00-04:00"),
    );
    assert.equal(payload.entryCount, 6);
    assert.equal(payload.amountDue, 50);
  });

  it("migrates Complete and Paid legacy rows to Included", () => {
    const headers = [
      "Submitted At", "Internal Order ID", "Name for Jar", "Email", "Phone", "E-transfer Name",
      "Entry Count", "Amount Due", "Message", "Payment Status", "Payment Confirmed At",
      "Payment Instructions Sent", "Paid Confirmation Sent", "Notes",
    ];
    const makeRow = (status, paidConfirmation) => [
      new Date("2026-07-10T12:00:00-04:00"), "BT-ABC123-TEST", "Sample Guest", "sample@example.test", "",
      "Sample Guest", 3, 25, "", status, new Date("2026-07-10T12:05:00-04:00"), "Yes", paidConfirmation, "",
    ];
    const complete = helpers.migrateLegacyOrderRow_(makeRow("Complete", "Yes"), headers);
    const paid = helpers.migrateLegacyOrderRow_(makeRow("Paid", "No"), headers);
    assert.equal(complete[9], "Included");
    assert.equal(complete[10], true);
    assert.equal(paid[9], "Included");
    assert.equal(paid[10], false);
    assert.equal(helpers.normalizeEntryStatus_("Pending"), "Included");
  });

  it("creates one private row for every included entry and excludes cancelled or refunded rows", () => {
    const rows = helpers.buildJarEntryRows_([
      includedRecord(),
      includedRecord({ internalOrderId: "BT-ABC125-TEST", jarName: "Second Guest", entryCount: 6, amountDue: 50 }),
      includedRecord({ internalOrderId: "BT-ABC126-TEST", entryStatus: "Cancelled" }),
      includedRecord({ internalOrderId: "BT-ABC127-TEST", entryStatus: "Refunded" }),
    ]);
    assert.equal(rows.length, 10);
    assert.deepEqual(Array.from(rows.slice(0, 4).map((row) => row[5])), [1, 2, 3, 4]);
    assert.equal(rows.filter((row) => row[0] === "Second Guest").length, 6);
  });

  it("creates exactly one row and one printable slip for one included entry", () => {
    const rows = helpers.buildJarEntryRows_([includedRecord({ entryCount: 1, amountDue: 10 })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][5], 1);
    assert.equal(helpers.countPrintableSlips_(helpers.buildPrintableSlipGrid_(rows.map((row) => row[0]), 2)), 1);
  });

  it("rejects submissions at and after the closing time", () => {
    const request = {
      internalOrderId: "BT-CLOSE1-TEST",
      jarName: "Sample Guest",
      email: "sample@example.test",
      phone: "",
      eTransferName: "Sample Guest",
      entryCount: 4,
      message: "",
      honeypot: "",
    };
    assert.throws(
      () => helpers.validateSubmission_(request, new Date("2026-08-15T22:00:00.000Z")),
      /Entries are closed/,
    );
  });

  it("keeps printable slip count equal to included entry count", () => {
    const names = ["A", "A", "B", "C", "C", "C"];
    const grid = helpers.buildPrintableSlipGrid_(names, 2);
    assert.equal(grid.length, 3);
    assert.equal(helpers.countPrintableSlips_(grid), names.length);
  });

  it("returns aggregate-only public status", () => {
    const status = helpers.buildPublicStatus_([
      includedRecord(),
      includedRecord({ internalOrderId: "BT-ABC128-TEST", jarName: "Second Guest", entryCount: 3, amountDue: 25 }),
    ], "2026-07-10T16:00:00.000Z");
    assert.deepEqual(Array.from(Object.keys(status)), [
      "confirmedSales",
      "confirmedEntryCount",
      "winnerPrize",
      "paidOrderCount",
      "lastUpdated",
    ]);
    assert.equal(status.confirmedSales, 60);
    assert.equal(status.confirmedEntryCount, 7);
    assert.equal(status.winnerPrize, 30);
    assert.equal(status.paidOrderCount, 2);
  });

  it("calculates submitted totals and payment-checkbox totals independently", () => {
    const summary = helpers.calculateSummary_([
      includedRecord({ entryCount: 3, amountDue: 25, paymentReceived: true }),
      includedRecord({ internalOrderId: "BT-ABC129-TEST", entryCount: 3, amountDue: 25, paymentReceived: false }),
      includedRecord({ internalOrderId: "BT-ABC130-TEST", entryStatus: "Cancelled", entryCount: 3, amountDue: 25, paymentReceived: true }),
    ]);
    assert.equal(summary.submittedEntryValue, 50);
    assert.equal(summary.paymentsReceived, 25);
    assert.equal(summary.paymentsStillToCheck, 25);
    assert.equal(summary.includedOrderCount, 2);
    assert.equal(summary.includedEntryCount, 6);
    assert.equal(summary.winnerPrize, 25);
  });

  it("blocks only matching submissions inside the two-minute duplicate window", () => {
    const now = new Date("2026-07-10T12:01:30-04:00");
    const payload = includedRecord({ submittedAt: undefined });
    assert.ok(helpers.findRecentDuplicate_([includedRecord()], payload, now, 120000));
    assert.equal(helpers.findRecentDuplicate_([
      includedRecord({ submittedAt: new Date("2026-07-10T11:58:00-04:00") }),
    ], payload, now, 120000), null);
  });

  it("contains the intended email subjects and omits retired public concepts", () => {
    assert.match(source, /Ben & Tori’s 50\/50 E-transfer Details/);
    assert.match(source, /refreshEverything_\(\)/);
    assert.match(source, /findRecentDuplicate_/);
    assert.match(source, /private jar rows and printable name slips/);
    const retiredPatterns = [
      ["ticket", "number"],
      ["winning", "ticket"],
      ["order", "reference"],
      ["include your", "order"],
      ["late", "payment"],
    ].map((parts) => new RegExp(parts.join("\\s+"), "i"));
    for (const pattern of retiredPatterns) assert.doesNotMatch(source, pattern);
  });

  it("keeps the Apps Script web app manifest valid", () => {
    assert.equal(manifest.timeZone, "America/Toronto");
    assert.equal(manifest.runtimeVersion, "V8");
    assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");
    assert.equal(manifest.webapp.access, "ANYONE_ANONYMOUS");
  });
});
