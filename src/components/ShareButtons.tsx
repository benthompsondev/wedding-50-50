import { useState } from "react";
import { siteConfig } from "../config";

export function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="copy-button" type="button" onClick={copyValue}>
      {copied ? "Copied" : label}
    </button>
  );
}

export function ShareDrawButton() {
  const [status, setStatus] = useState("");

  async function share(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({
          title: siteConfig.title,
          text: "We’re skipping the stag and doe and doing one wedding 50/50 instead.",
          url: siteConfig.publicWebsiteUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(siteConfig.publicWebsiteUrl);
      setStatus("Link copied");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Copy the link from your browser");
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  return (
    <button className="copy-button share-button" type="button" onClick={share}>
      {status || "Share this draw"}
    </button>
  );
}

export function SharePaymentButton({ text }: { text: string }) {
  const [status, setStatus] = useState("");

  async function share(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Ben & Tori’s 50/50 payment details", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus("Details copied");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Use Copy payment details");
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  return (
    <button className="copy-button" type="button" onClick={share}>
      {status || "Share payment details"}
    </button>
  );
}
