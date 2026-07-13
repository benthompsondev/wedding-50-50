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
  };`,
  context,
);

const helpers = context.__helpers;
const paidRecord = (overrides = {}) => ({
  internalOrderId: "BT-ABC123-TEST",
  jarName: "Sample Guest",
  email: "sample@example.test",
  phone: "",
  eTransferName: "Sample Guest",
  entryCount: 4,
  amountDue: 35,
  message: "",
  paymentStatus: "Paid",
  paymentConfirmedAt: new Date("2026-07-10T12:00:00-04:00"),
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

  it("creates one private row for every paid entry", () => {
    const rows = helpers.buildJarEntryRows_([
      paidRecord(),
      paidRecord({ internalOrderId: "BT-ABC125-TEST", jarName: "Second Guest", entryCount: 6, amountDue: 50 }),
      paidRecord({ internalOrderId: "BT-ABC126-TEST", paymentStatus: "Pending" }),
      paidRecord({ internalOrderId: "BT-ABC127-TEST", paymentStatus: "Refunded" }),
    ]);
    assert.equal(rows.length, 10);
    assert.deepEqual(Array.from(rows.slice(0, 4).map((row) => row[5])), [1, 2, 3, 4]);
    assert.equal(rows.filter((row) => row[0] === "Second Guest").length, 6);
  });

  it("creates exactly one row for one paid entry", () => {
    const rows = helpers.buildJarEntryRows_([paidRecord({ entryCount: 1, amountDue: 10 })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][5], 1);
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

  it("keeps printable slip count equal to paid entry count", () => {
    const names = ["A", "A", "B", "C", "C", "C"];
    const grid = helpers.buildPrintableSlipGrid_(names, 2);
    assert.equal(grid.length, 3);
    assert.equal(helpers.countPrintableSlips_(grid), names.length);
  });

  it("returns aggregate-only public status", () => {
    const status = helpers.buildPublicStatus_([
      paidRecord(),
      paidRecord({ internalOrderId: "BT-ABC128-TEST", jarName: "Second Guest", entryCount: 3, amountDue: 25 }),
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
  });

  it("contains the intended email subjects and omits retired public concepts", () => {
    assert.match(source, /Ben & Tori’s 50\/50 E-transfer Details/);
    assert.match(source, /You’re in Ben & Tori’s Wedding 50\/50/);
    assert.match(source, /physical jar/);
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
