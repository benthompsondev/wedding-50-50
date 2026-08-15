import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateAmountForEntryCount,
  calculateWinnerPrize,
  createInternalOrderId,
  createSubmissionGuard,
  getInitialBackendReadiness,
  getCountdownParts,
  getWrappedPhotoIndex,
  formatCurrency,
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

  it("warns about obvious email-domain typos without rejecting unfamiliar valid providers", () => {
    for (const [domain, suggestion] of [
      ["hot.ail.com", "hotmail.com"],
      ["hotmai.com", "hotmail.com"],
      ["gmial.com", "gmail.com"],
      ["gmal.com", "gmail.com"],
    ]) {
      expect(validateEntryForm({ ...validForm, email: `person@${domain}` }).email).toContain(suggestion);
    }
    expect(validateEntryForm({ ...validForm, email: "person@small-provider.example" })).toEqual({});
  });

  it("keeps preview mode until valid dates and an endpoint are present", () => {
    const close = "2026-08-15T18:00:00-04:00";
    const draw = "2026-08-15T20:00:00-04:00";
    expect(isLaunchReady(close, draw, "")).toBe(false);
    expect(isLaunchReady(close, draw, "https://example.test/exec")).toBe(true);
    expect(isLaunchReady("TODO", draw, "https://example.test/exec")).toBe(false);
    expect(getInitialBackendReadiness(close, draw, "")).toBe("preview");
    expect(getInitialBackendReadiness(close, draw, "https://example.test/exec")).toBe("checking");
  });

  it("wraps photo navigation in both directions", () => {
    expect(getWrappedPhotoIndex(0, -1, 6)).toBe(5);
    expect(getWrappedPhotoIndex(5, 1, 6)).toBe(0);
    expect(getWrappedPhotoIndex(2, 1, 6)).toBe(3);
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
    expect(formatCurrency(17.5)).toBe("$17.50");
    expect(formatCurrency(35)).toBe("$35");
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

  it("includes the winning draw video in the public site assets", () => {
    const video = new URL("../../public/videos/winning-draw.mp4", import.meta.url);
    expect(statSync(video).size).toBeGreaterThan(0);
  });

  it("keeps the completed-draw copy, video, and accessible lightbox controls in the public component", () => {
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain("The draw is complete");
    expect(appSource).toContain("Congratulations {siteConfig.winnerAnnouncement.name}");
    expect(appSource).toContain('className="winning-video" controls playsInline');
    expect(appSource).not.toContain("<EntryForm");
    expect(appSource).toContain("Our little family");
    expect(appSource).toContain("Lily was in charge of jar security and moral support.");
    const lightboxSource = [
      readFileSync(new URL("../components/PhotoLightbox.tsx", import.meta.url), "utf8"),
      readFileSync(new URL("../hooks/usePhotoLightbox.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(lightboxSource).toContain('role="dialog"');
    expect(lightboxSource).toContain('aria-modal="true"');
    expect(lightboxSource).toContain('event.key === "Escape"');
    expect(lightboxSource).toContain('event.key === "ArrowLeft"');
    expect(lightboxSource).toContain('event.key === "ArrowRight"');
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".photo-thumb-label");
    const config = readFileSync(new URL("../config.ts", import.meta.url), "utf8");
    expect(config).toContain("Ben and Tori sharing a quiet moment in the golden sunset light");
  });
});
