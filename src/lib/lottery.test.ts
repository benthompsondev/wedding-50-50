import { describe, expect, it } from "vitest";
import {
  calculateAmountDue,
  calculateTicketCount,
  calculateWinnerPrize,
  createOrderId,
  createSubmissionGuard,
  getCountdownParts,
  isSalesClosed,
  parsePublicStatus,
  validateEntryForm,
  type EntryFormData,
} from "./lottery";

const validForm: EntryFormData = {
  fullName: "Avery Example",
  email: "avery@example.test",
  phone: "",
  packageId: "triple",
  eTransferName: "Avery Example",
  message: "",
  confirmed: true,
  honeypot: "",
};

describe("wedding 50/50 helpers", () => {
  it("creates order IDs in the documented format", () => {
    expect(createOrderId(new Date("2026-07-13T12:00:00Z"))).toMatch(/^BT-[A-Z0-9]{6}-[A-Z0-9]{4}$/);
  });

  it("calculates package amounts and ticket counts from package IDs", () => {
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
