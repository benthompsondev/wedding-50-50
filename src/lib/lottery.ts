import { ticketPackages, type TicketPackageConfig } from "../config";

export type EntryFormData = {
  fullName: string;
  email: string;
  phone: string;
  packageId: string;
  ticketQuantity?: string;
  eTransferName: string;
  message: string;
  confirmed: boolean;
  honeypot: string;
};

export type EntryFormErrors = Partial<Record<keyof EntryFormData | "form", string>>;

export type PublicStatus = {
  confirmedSales: number;
  confirmedTicketCount: number;
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
const ORDER_ID_PATTERN = /^BT-[A-Z0-9]+-[A-Z0-9]{4}$/;
export const MIN_TICKET_QUANTITY = 1;
export const MAX_TICKET_QUANTITY = 99;

export function getPackageById(packageId: string): TicketPackageConfig | undefined {
  return ticketPackages.find((ticketPackage) => ticketPackage.id === packageId);
}

export function parseTicketQuantity(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;

  const quantity = Number(text);
  if (!Number.isInteger(quantity) || quantity < MIN_TICKET_QUANTITY || quantity > MAX_TICKET_QUANTITY) {
    return null;
  }

  return quantity;
}

export function calculateAmountForQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < MIN_TICKET_QUANTITY || quantity > MAX_TICKET_QUANTITY) {
    return 0;
  }

  return Math.floor(quantity / 3) * 25 + (quantity % 3) * 10;
}

export function calculateSavingsForQuantity(quantity: number): number {
  const amount = calculateAmountForQuantity(quantity);
  return amount > 0 ? quantity * 10 - amount : 0;
}

export function calculateAmountDue(selection: number | string): number {
  if (typeof selection === "number") {
    return calculateAmountForQuantity(selection);
  }

  const ticketPackage = getPackageById(selection);
  if (ticketPackage) return ticketPackage.amount;

  const quantity = parseTicketQuantity(selection);
  return quantity === null ? 0 : calculateAmountForQuantity(quantity);
}

export function calculateTicketCount(selection: number | string): number {
  if (typeof selection === "number") {
    return Number.isInteger(selection) && selection >= MIN_TICKET_QUANTITY && selection <= MAX_TICKET_QUANTITY
      ? selection
      : 0;
  }

  return getPackageById(selection)?.tickets ?? parseTicketQuantity(selection) ?? 0;
}

export function calculateWinnerPrize(confirmedSales: number): number {
  if (!Number.isFinite(confirmedSales) || confirmedSales < 0) {
    return 0;
  }

  return Math.round(confirmedSales * 0.5 * 100) / 100;
}

export function isConfigDate(value: string): boolean {
  return Boolean(value) && !value.toUpperCase().startsWith("TODO") && !Number.isNaN(Date.parse(value));
}

export function isSalesClosed(closingDate: string, now = new Date()): boolean {
  return isConfigDate(closingDate) && now.getTime() >= new Date(closingDate).getTime();
}

export function getCountdownParts(closingDate: string, now = new Date()): CountdownParts | null {
  if (!isConfigDate(closingDate)) {
    return null;
  }

  const difference = new Date(closingDate).getTime() - now.getTime();
  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(difference / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function createOrderId(now = new Date()): string {
  const shortTimestamp = now.getTime().toString(36).toUpperCase().slice(-6).padStart(6, "0");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";

  for (let index = 0; index < 4; index += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `BT-${shortTimestamp}-${randomPart}`;
}

export function isOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value);
}

export function validateEntryForm(form: EntryFormData): EntryFormErrors {
  const errors: EntryFormErrors = {};

  if (!form.fullName.trim()) {
    errors.fullName = "Please enter the name for this order.";
  }

  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  if (form.ticketQuantity !== undefined) {
    if (parseTicketQuantity(form.ticketQuantity) === null) {
      errors.ticketQuantity = `Choose between ${MIN_TICKET_QUANTITY} and ${MAX_TICKET_QUANTITY} whole tickets.`;
    }
  } else if (!getPackageById(form.packageId)) {
    errors.packageId = "Please choose a ticket package.";
  }

  if (!form.eTransferName.trim()) {
    errors.eTransferName = "Please tell us the name that will appear on the transfer.";
  }

  if (!form.confirmed) {
    errors.confirmed = "Please confirm that the submitted information is correct.";
  }

  if (form.honeypot.trim()) {
    errors.form = "We could not submit this entry. Please try again.";
  }

  return errors;
}

export function createSubmissionGuard() {
  let locked = false;

  return {
    acquire(): boolean {
      if (locked) {
        return false;
      }

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
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const numericFields = ["confirmedSales", "confirmedTicketCount", "winnerPrize", "paidOrderCount"];
  if (numericFields.some((field) => typeof candidate[field] !== "number" || !Number.isFinite(candidate[field]) || (candidate[field] as number) < 0)) {
    return null;
  }

  if (typeof candidate.lastUpdated !== "string" || !candidate.lastUpdated.trim()) {
    return null;
  }

  return {
    confirmedSales: candidate.confirmedSales as number,
    confirmedTicketCount: candidate.confirmedTicketCount as number,
    winnerPrize: candidate.winnerPrize as number,
    paidOrderCount: candidate.paidOrderCount as number,
    lastUpdated: candidate.lastUpdated,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function padCountdownValue(value: number): string {
  return value.toString().padStart(2, "0");
}
