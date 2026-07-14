// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const publicStatus = {
  confirmedSales: 100,
  confirmedEntryCount: 12,
  winnerPrize: 50,
  paidOrderCount: 4,
  lastUpdated: "2026-07-13T12:00:00.000Z",
};

function statusResponse() {
  return { ok: true, json: async () => publicStatus };
}

function renderWithFetch(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(<App />);
}

async function waitForEntryForm(): Promise<HTMLFormElement> {
  return await waitFor(() => {
    const form = document.querySelector<HTMLFormElement>("form.form-card");
    expect(form).not.toBeNull();
    return form as HTMLFormElement;
  });
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.clear(screen.getByLabelText("Number of entries"));
  await user.type(screen.getByLabelText("Number of entries"), "4");
  await user.type(screen.getByLabelText(/Name for the jar/), "Avery Example");
  await user.type(screen.getByLabelText(/Email address/), "avery@example.test");
  await user.type(screen.getByLabelText(/Name the e-transfer will come from/), "Avery Transfer");
}

describe("wedding draw interactions", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the form unavailable while backend health is checking", () => {
    renderWithFetch(vi.fn().mockReturnValue(new Promise(() => undefined)));

    expect(screen.getByText("Getting the entry form ready…")).not.toBeNull();
    expect(document.querySelector("form.form-card")).toBeNull();
  });

  it("displays the form after a valid status response", async () => {
    renderWithFetch(vi.fn().mockResolvedValue(statusResponse()));

    expect(await waitForEntryForm()).not.toBeNull();
  });

  it("shows a friendly unavailable state when the backend check fails", async () => {
    renderWithFetch(vi.fn().mockRejectedValue(new Error("offline")));

    expect(await screen.findByText("Entries are temporarily unavailable")).not.toBeNull();
    expect(screen.getByText("The entry form is having a moment. Try refreshing, or message us if it keeps happening.")).not.toBeNull();
    expect(document.querySelector("form.form-card")).toBeNull();
  });

  it("updates entry pricing when the quantity changes", async () => {
    const user = userEvent.setup();
    renderWithFetch(vi.fn().mockResolvedValue(statusResponse()));
    await waitForEntryForm();

    const quantity = screen.getByLabelText("Number of entries");
    await user.clear(quantity);
    await user.type(quantity, "4");

    expect(screen.getAllByText("$35").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4 entries/).length).toBeGreaterThan(0);
  });

  it("shows trusted payment details after a successful submission", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => (
      options?.method === "POST"
        ? Promise.resolve({ ok: true, json: async () => ({ ok: true, entryCount: 4, amountDue: 35 }) })
        : Promise.resolve(statusResponse())
    ));
    const user = userEvent.setup();
    renderWithFetch(fetchMock);
    await waitForEntryForm();
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: /Show e-transfer details/ }));

    expect(await screen.findByText("Thanks, Avery. Your entries are recorded.")).not.toBeNull();
    expect(screen.getByText(/we’ll check it off on our end/)).not.toBeNull();
    expect(screen.getAllByText("4 entries").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$35").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("BT-");
  });

  it("prevents a duplicate submission while the first request is pending", async () => {
    let resolveSubmission: ((value: unknown) => void) | undefined;
    const pendingSubmission = new Promise((resolve) => { resolveSubmission = resolve; });
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => (
      options?.method === "POST" ? pendingSubmission : Promise.resolve(statusResponse())
    ));
    const user = userEvent.setup();
    renderWithFetch(fetchMock);
    const form = await waitForEntryForm();
    await fillRequiredFields(user);

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
      expect(postCalls).toHaveLength(1);
    });

    await act(async () => {
      resolveSubmission?.({ ok: true, json: async () => ({ ok: true, entryCount: 4, amountDue: 35 }) });
      await pendingSubmission;
    });
  });

  it("opens, navigates, closes, and restores focus in the photo lightbox", async () => {
    const user = userEvent.setup();
    renderWithFetch(vi.fn().mockResolvedValue(statusResponse()));
    const firstThumbnail = screen.getByRole("button", { name: /Open photo 1 of 6/ });

    await user.click(firstThumbnail);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByText("Photo 1 of 6")).not.toBeNull();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("Photo 2 of 6")).not.toBeNull();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("Photo 1 of 6")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(firstThumbnail);
  });

  it("closes the photo lightbox with its close button", async () => {
    const user = userEvent.setup();
    renderWithFetch(vi.fn().mockResolvedValue(statusResponse()));

    await user.click(screen.getByRole("button", { name: /Open photo 1 of 6/ }));
    await user.click(screen.getByRole("button", { name: "Close photo viewer" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refreshes aggregate status on load, focus, and the 60-second interval", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(statusResponse());
    renderWithFetch(fetchMock);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const [firstUrl, firstOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("action=status");
    expect(firstUrl).toMatch(/[_]=\d+/);
    expect(firstOptions.cache).toBe("no-store");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
