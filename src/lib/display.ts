import { isConfigDate } from "./lottery";

export function scrollToSection(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export function formatEventDate(value: string, fallback = "Date to be announced"): string {
  if (!isConfigDate(value)) return fallback;
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

export function formatEventDateTime(value: string, fallback = "Date and time to be announced"): string {
  if (!isConfigDate(value)) return fallback;
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(new Date(value));
  return `${formatEventDate(value, fallback)} at ${time}`;
}

export function formatLastUpdated(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(parsed);
}

export function getFirstName(value: string): string {
  return value.trim().split(/\s+/)[0] || "there";
}
