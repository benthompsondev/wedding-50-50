import {
  calculateAmountForEntryCount,
  createInternalOrderId,
  parseEntryCount,
  parsePublicStatus,
  type EntryFormData,
  type PublicStatus,
} from "../lib/lottery";

type SubmissionResponse = {
  ok?: boolean;
  message?: string;
  entryCount?: number;
  amountDue?: number;
};

export type TrustedSubmission = {
  entryCount: number;
  amountDue: number;
};

export async function fetchPublicStatus(endpoint: string, signal: AbortSignal): Promise<PublicStatus> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const response = await fetch(`${endpoint}${separator}action=status&_=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Status request failed");

  const status = parsePublicStatus(await response.json() as unknown);
  if (!status) throw new Error("Status response was invalid");
  return status;
}

export async function submitEntry(
  endpoint: string,
  form: EntryFormData,
  trustedLocalCount: number,
  fallbackAmount: number,
): Promise<TrustedSubmission> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      internalOrderId: createInternalOrderId(),
      jarName: form.jarName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      entryCount: trustedLocalCount,
      eTransferName: form.eTransferName.trim(),
      message: form.message.trim(),
      honeypot: form.honeypot,
    }),
  });

  const payload = (await response.json().catch(() => null)) as SubmissionResponse | null;
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message ?? "We couldn’t save that. Please try again.");
  }

  const serverCount = parseEntryCount(payload.entryCount ?? trustedLocalCount);
  const serverAmount = typeof payload.amountDue === "number" ? payload.amountDue : fallbackAmount;
  if (serverCount === null || serverAmount !== calculateAmountForEntryCount(serverCount)) {
    throw new Error("We couldn’t confirm the amount. Please try again.");
  }

  return { entryCount: serverCount, amountDue: serverAmount };
}
