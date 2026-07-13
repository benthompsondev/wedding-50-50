export type EntryFormData = {
  jarName: string;
  email: string;
  phone: string;
  entryCount: string;
  eTransferName: string;
  message: string;
  honeypot: string;
};

export type EntryFormErrors = Partial<Record<keyof EntryFormData | "form", string>>;

export type PublicStatus = {
  confirmedSales: number;
  confirmedEntryCount: number;
  winnerPrize: number;
  paidOrderCount: number;
  lastUpdated: string;
};

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_ENTRY_COUNT = 1;
export const MAX_ENTRY_COUNT = 99;

export function parseEntryCount(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;

  const entryCount = Number(text);
  if (!Number.isInteger(entryCount) || entryCount < MIN_ENTRY_COUNT || entryCount > MAX_ENTRY_COUNT) {
    return null;
  }

  return entryCount;
}

export function calculateAmountForEntryCount(entryCount: number): number {
  if (!Number.isInteger(entryCount) || entryCount < MIN_ENTRY_COUNT || entryCount > MAX_ENTRY_COUNT) {
    return 0;
  }

  return Math.floor(entryCount / 3) * 25 + (entryCount % 3) * 10;
}

export function calculateWinnerPrize(confirmedSales: number): number {
  if (!Number.isFinite(confirmedSales) || confirmedSales < 0) return 0;
  return Math.round(confirmedSales * 0.5 * 100) / 100;
}

export function isConfigDate(value: string): boolean {
  return Boolean(value) && !value.toUpperCase().startsWith("TODO") && !Number.isNaN(Date.parse(value));
}

export function isLaunchReady(closingDate: string, drawDate: string, endpoint: string): boolean {
  return isConfigDate(closingDate) && isConfigDate(drawDate) && Boolean(endpoint.trim());
}

export function isSalesClosed(closingDate: string, now = new Date()): boolean {
  return isConfigDate(closingDate) && now.getTime() >= new Date(closingDate).getTime();
}

export function getCountdownParts(closingDate: string, now = new Date()): CountdownParts | null {
  if (!isConfigDate(closingDate)) return null;

  const difference = new Date(closingDate).getTime() - now.getTime();
  if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const totalSeconds = Math.floor(difference / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function createInternalOrderId(now = new Date()): string {
  const shortTimestamp = now.getTime().toString(36).toUpperCase().slice(-6).padStart(6, "0");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";

  for (let index = 0; index < 4; index += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `BT-${shortTimestamp}-${randomPart}`;
}

export function validateEntryForm(form: EntryFormData): EntryFormErrors {
  const errors: EntryFormErrors = {};

  if (!form.jarName.trim()) errors.jarName = "Please enter the name you want us to put in the jar.";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Please enter a valid email address.";
  if (parseEntryCount(form.entryCount) === null) {
    errors.entryCount = `Choose between ${MIN_ENTRY_COUNT} and ${MAX_ENTRY_COUNT} whole entries.`;
  }
  if (!form.eTransferName.trim()) {
    errors.eTransferName = "Please enter the name the e-transfer will come from.";
  }
  if (form.honeypot.trim()) errors.form = "We couldn’t save that. Please try again.";

  return errors;
}

export function createSubmissionGuard() {
  let locked = false;

  return {
    acquire(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    release(): void {
      locked = false;
    },
    isLocked(): boolean {
      return locked;
    },
  };
}

export function parsePublicStatus(value: unknown): PublicStatus | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const numericFields = ["confirmedSales", "confirmedEntryCount", "winnerPrize", "paidOrderCount"];
  if (numericFields.some((field) =>
    typeof candidate[field] !== "number"
    || !Number.isFinite(candidate[field])
    || (candidate[field] as number) < 0
  )) {
    return null;
  }

  if (typeof candidate.lastUpdated !== "string" || !candidate.lastUpdated.trim()) return null;

  return {
    confirmedSales: candidate.confirmedSales as number,
    confirmedEntryCount: candidate.confirmedEntryCount as number,
    winnerPrize: candidate.winnerPrize as number,
    paidOrderCount: candidate.paidOrderCount as number,
    lastUpdated: candidate.lastUpdated,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function padCountdownValue(value: number): string {
  return value.toString().padStart(2, "0");
}
