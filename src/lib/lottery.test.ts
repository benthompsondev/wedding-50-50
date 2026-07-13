import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateAmountForEntryCount,
  calculateWinnerPrize,
  createInternalOrderId,
  createSubmissionGuard,
  getCountdownParts,
  isLaunchReady,
  isSalesClosed,
  parseEntryCount,
  parsePublicStatus,
  validateEntryForm,
  type EntryFormData,
} from "./lottery";

const validForm: EntryFormData = {
  jarName: "Avery Example",
  email: "avery@example.test",
  phone: "",
  entryCount: "6",
  eTransferName: "Avery Example",
  message: "",
  honeypot: "",
};

describe("wedding 50/50 helpers", () => {
  it("creates private IDs for duplicate prevention", () => {
    expect(createInternalOrderId(new Date("2026-07-13T12:00:00Z"))).toMatch(/^BT-[A-Z0-9]{6}-[A-Z0-9]{4}$/);
  });

  it("uses the repeating 3-for-$25 pricing formula", () => {
    const expected: Record<number, number> = {
      1: 10,
      2: 20,
      3: 25,
      4: 35,
      5: 45,
      6: 50,
      9: 75,
      12: 100,
      99: 825,
    };

    for (const [entryCount, amount] of Object.entries(expected)) {
      expect(calculateAmountForEntryCount(Number(entryCount))).toBe(amount);
    }
  });

  it("rejects invalid entry quantities", () => {
    for (const value of ["", "0", "-1", "1.5", "abc", "100", "101"]) {
      expect(parseEntryCount(value)).toBeNull();
      expect(validateEntryForm({ ...validForm, entryCount: value })).toHaveProperty("entryCount");
    }
  });

  it("validates the required form fields without a contract-style checkbox", () => {
    expect(validateEntryForm(validForm)).toEqual({});
    expect(validateEntryForm({ ...validForm, jarName: "" })).toHaveProperty("jarName");
    expect(validateEntryForm({ ...validForm, email: "not-an-email" })).toHaveProperty("email");
    expect(validateEntryForm({ ...validForm, eTransferName: "" })).toHaveProperty("eTransferName");
    expect(validateEntryForm({ ...validForm, honeypot: "bot" })).toHaveProperty("form");
  });

  it("keeps preview mode until valid dates and an endpoint are present", () => {
    const close = "2026-08-15T18:00:00-04:00";
    const draw = "2026-08-15T20:00:00-04:00";
    expect(isLaunchReady(close, draw, "")).toBe(false);
    expect(isLaunchReady(close, draw, "https://example.test/exec")).toBe(true);
    expect(isLaunchReady("TODO", draw, "https://example.test/exec")).toBe(false);
  });

  it("enforces the sales cutoff and calculates the countdown", () => {
    expect(isSalesClosed("2026-08-15T18:00:00-04:00", new Date("2026-08-15T21:59:59Z"))).toBe(false);
    expect(isSalesClosed("2026-08-15T18:00:00-04:00", new Date("2026-08-15T22:00:00Z"))).toBe(true);
    expect(getCountdownParts("2026-07-13T12:01:05Z", new Date("2026-07-13T12:00:00Z"))).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 5,
    });
  });

  it("prevents duplicate submissions until a failed request releases the guard", () => {
    const guard = createSubmissionGuard();
    expect(guard.acquire()).toBe(true);
    expect(guard.acquire()).toBe(false);
    guard.release();
    expect(guard.acquire()).toBe(true);
  });

  it("returns aggregate status without carrying personal fields through", () => {
    const parsed = parsePublicStatus({
      confirmedSales: 100,
      confirmedEntryCount: 12,
      winnerPrize: 50,
      paidOrderCount: 4,
      lastUpdated: "2026-07-13T12:00:00Z",
      fullName: "ignored",
      email: "ignored@example.test",
    });
    expect(parsed).toEqual({
      confirmedSales: 100,
      confirmedEntryCount: 12,
      winnerPrize: 50,
      paidOrderCount: 4,
      lastUpdated: "2026-07-13T12:00:00Z",
    });
    expect(Object.keys(parsed ?? {})).toEqual([
      "confirmedSales",
      "confirmedEntryCount",
      "winnerPrize",
      "paidOrderCount",
      "lastUpdated",
    ]);
  });

  it("calculates half the pot", () => {
    expect(calculateWinnerPrize(35)).toBe(17.5);
    expect(calculateWinnerPrize(-10)).toBe(0);
  });

  it("keeps stale checkout language out of the public component", () => {
    const source = readFileSync(new URL("../App.tsx", import.meta.url), "utf8").toLowerCase();
    const removedPhrases = [
      ["order", "reference"].join(" "),
      ["ticket", "number"].join(" "),
      ["you", "save"].join(" "),
      ["late", "payment"].join(" "),
    ];
    for (const phrase of removedPhrases) expect(source).not.toContain(phrase);
  });
});
