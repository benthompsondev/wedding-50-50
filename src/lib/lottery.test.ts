import { describe, expect, it } from "vitest";
import {
  calculateAmountDue,
  calculateAmountForQuantity,
  calculateSavingsForQuantity,
  calculateTicketCount,
  calculateWinnerPrize,
  createOrderId,
  createSubmissionGuard,
  getCountdownParts,
  isSalesClosed,
  parsePublicStatus,
  parseTicketQuantity,
  validateEntryForm,
  type EntryFormData,
} from "./lottery";

const validForm: EntryFormData = {
  fullName: "Avery Example",
  email: "avery@example.test",
  phone: "",
  packageId: "quantity",
  ticketQuantity: "6",
  eTransferName: "Avery Example",
  message: "",
  confirmed: true,
  honeypot: "",
};

describe("wedding 50/50 helpers", () => {
  it("creates order IDs in the documented format", () => {
    expect(createOrderId(new Date("2026-07-13T12:00:00Z"))).toMatch(/^BT-[A-Z0-9]{6}-[A-Z0-9]{4}$/);
  });

  it("uses the repeating 3-for-$25 pricing formula", () => {
    const expected: Record<number, number> = {
      1: 10,
      2: 20,
      3: 25,
      4: 35,
      5: 45,
      6: 50,
      7: 60,
      8: 70,
      9: 75,
      12: 100,
      99: 825,
    };

    for (const [quantity, amount] of Object.entries(expected)) {
      expect(calculateAmountForQuantity(Number(quantity))).toBe(amount);
      expect(calculateAmountDue(quantity)).toBe(amount);
      expect(calculateTicketCount(quantity)).toBe(Number(quantity));
    }

    expect(calculateSavingsForQuantity(6)).toBe(10);
    expect(calculateAmountForQuantity(0)).toBe(0);
    expect(calculateAmountForQuantity(100)).toBe(0);
  });

  it("rejects blank, decimal, negative, malformed, and out-of-range quantities", () => {
    for (const value of ["", "0", "-1", "1.5", "abc", "100", "101"]) {
      expect(parseTicketQuantity(value)).toBeNull();
      expect(validateEntryForm({ ...validForm, ticketQuantity: value })).toHaveProperty("ticketQuantity");
    }
  });

  it("keeps the original fixed-package compatibility path", () => {
    const legacyForm: EntryFormData = { ...validForm, packageId: "triple", ticketQuantity: undefined };
    expect(validateEntryForm(legacyForm)).toEqual({});
    expect(calculateAmountDue("single")).toBe(10);
    expect(calculateAmountDue("triple")).toBe(25);
    expect(calculateTicketCount("single")).toBe(1);
    expect(calculateTicketCount("triple")).toBe(3);
    expect(calculateAmountDue("unknown")).toBe(0);
  });

  it("detects a configured closing date while leaving TODO dates open", () => {
    expect(isSalesClosed("TODO_DRAW_CLOSING_DATE", new Date("2026-07-13T12:00:00Z"))).toBe(false);
    expect(isSalesClosed("2026-07-13T11:00:00Z", new Date("2026-07-13T12:00:00Z"))).toBe(true);
    expect(getCountdownParts("2026-07-13T12:01:05Z", new Date("2026-07-13T12:00:00Z"))).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 5 });
  });

  it("validates required form fields and accepts a complete form", () => {
    expect(validateEntryForm(validForm)).toEqual({});
    expect(validateEntryForm({ ...validForm, email: "not-an-email" })).toHaveProperty("email");
    expect(validateEntryForm({ ...validForm, confirmed: false })).toHaveProperty("confirmed");
    expect(validateEntryForm({ ...validForm, honeypot: "bot" })).toHaveProperty("form");
  });

  it("calculates half of confirmed sales without inventing a negative prize", () => {
    expect(calculateWinnerPrize(35)).toBe(17.5);
    expect(calculateWinnerPrize(0)).toBe(0);
    expect(calculateWinnerPrize(-10)).toBe(0);
  });

  it("prevents duplicate submissions until a failed request releases the guard", () => {
    const guard = createSubmissionGuard();
    expect(guard.acquire()).toBe(true);
    expect(guard.acquire()).toBe(false);
    guard.release();
    expect(guard.acquire()).toBe(true);
  });

  it("parses only a safe aggregate public status", () => {
    expect(parsePublicStatus({ confirmedSales: 100, confirmedTicketCount: 10, winnerPrize: 50, paidOrderCount: 4, lastUpdated: "2026-07-13T12:00:00Z", fullName: "ignored" })).toEqual({
      confirmedSales: 100,
      confirmedTicketCount: 10,
      winnerPrize: 50,
      paidOrderCount: 4,
      lastUpdated: "2026-07-13T12:00:00Z",
    });
    expect(parsePublicStatus({ confirmedSales: "100" })).toBeNull();
  });
});
