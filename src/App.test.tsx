// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const publicStatus = {
  confirmedSales: 100,
  confirmedEntryCount: 12,
  winnerPrize: 50,
  paidOrderCount: 4,
  lastUpdated: "2026-07-13T12:00:00.000Z",
};

describe("wedding photo lightbox", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderWithFetch(fetchMock: ReturnType<typeof vi.fn>): Promise<void> {
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });
  }

  it("opens from a thumbnail, navigates with the keyboard, and restores focus", async () => {
    await renderWithFetch(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => publicStatus,
    }));
    const firstThumbnail = container.querySelector<HTMLButtonElement>(".photo-thumb");
    expect(firstThumbnail).not.toBeNull();

    await act(async () => firstThumbnail?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(container.textContent).toContain("Photo 1 of 6");

    const nextButton = container.querySelector<HTMLButtonElement>('[aria-label="Next photo"]');
    const previousButton = container.querySelector<HTMLButtonElement>('[aria-label="Previous photo"]');
    expect(nextButton).not.toBeNull();
    expect(previousButton).not.toBeNull();

    await act(async () => nextButton?.click());
    expect(container.textContent).toContain("Photo 2 of 6");

    await act(async () => previousButton?.click());
    expect(container.textContent).toContain("Photo 1 of 6");

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(container.textContent).toContain("Photo 2 of 6");

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(container.textContent).toContain("Photo 1 of 6");

    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="Close photo viewer"]');
    closeButton?.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true })));
    expect(document.activeElement).toBe(nextButton);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(firstThumbnail);
  });

  it("keeps the form hidden while checking and opens it only after a valid status", async () => {
    let resolveStatus: ((value: unknown) => void) | undefined;
    const statusRequest = new Promise((resolve) => { resolveStatus = resolve; });
    await renderWithFetch(vi.fn().mockReturnValue(statusRequest));

    expect(container.textContent).toContain("Getting the entry form ready…");
    expect(container.querySelector("form.form-card")).toBeNull();

    await act(async () => {
      resolveStatus?.({ ok: true, json: async () => publicStatus });
      await statusRequest;
      await Promise.resolve();
    });

    expect(container.querySelector("form.form-card")).not.toBeNull();
  });

  it("shows a friendly unavailable state when the health check fails", async () => {
    await renderWithFetch(vi.fn().mockRejectedValue(new Error("offline")));
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain("Entries are temporarily unavailable");
    expect(container.textContent).toContain("The entry form is having a moment");
    expect(container.querySelector("form.form-card")).toBeNull();
  });

  it("shows the trusted payment details after a successful four-entry submission", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => (
      options?.method === "POST"
        ? Promise.resolve({ ok: true, json: async () => ({ ok: true, entryCount: 4, amountDue: 35 }) })
        : Promise.resolve({ ok: true, json: async () => publicStatus })
    ));
    await renderWithFetch(fetchMock);
    await act(async () => { await Promise.resolve(); });

    function enter(selector: string, value: string): void {
      const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!element) throw new Error(`Missing test field: ${selector}`);
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await act(async () => {
      enter("#entryCount", "4");
      enter("#jarName", "Avery Example");
      enter("#email", "avery@example.test");
      enter("#eTransferName", "Avery Transfer");
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Thanks, Avery. Your entries are recorded.");
    expect(container.textContent).toContain("we’ll check it off on our end");
    expect(container.textContent).toContain("4 entries");
    expect(container.textContent).toContain("$35");
    expect(container.textContent).not.toContain("BT-");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== "POST").length).toBeGreaterThanOrEqual(2);
  });

  it("refreshes status without cache on load, focus, and the 60-second interval", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => publicStatus });
    await renderWithFetch(fetchMock);
    await act(async () => { await Promise.resolve(); });

    const [firstUrl, firstOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("action=status");
    expect(firstUrl).toMatch(/[_]=\d+/);
    expect(firstOptions.cache).toBe("no-store");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
