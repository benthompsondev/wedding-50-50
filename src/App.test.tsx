// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("completed wedding draw page", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the thank-you message, winning draw, and final winner", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Thank You" })).not.toBeNull();
    expect(screen.getByText(/It honestly means a lot to both of us/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "The Winning Draw" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Congratulations Alanna Thompson!/ })).not.toBeNull();
    expect(screen.getByText("$1,100")).not.toBeNull();
  });

  it("renders a controlled, non-autoplaying video from the packaged site asset", () => {
    render(<App />);

    const video = screen.getByLabelText("Winning draw video") as HTMLVideoElement;
    const source = video.querySelector("source");

    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(source?.getAttribute("src")).toBe("./videos/winning-draw.mp4");
    expect(source?.getAttribute("type")).toBe("video/mp4");
  });

  it("does not render or activate the former entry flow", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByText("Get entries")).toBeNull();
    expect(screen.queryByText("Join the draw")).toBeNull();
    expect(screen.queryByText("How do I pay?")).toBeNull();
    expect(document.body.textContent).not.toContain("Entries opening soon");
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens, navigates, closes, and restores focus in the photo lightbox", async () => {
    const user = userEvent.setup();
    render(<App />);
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
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Open photo 1 of 6/ }));
    await user.click(screen.getByRole("button", { name: "Close photo viewer" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
