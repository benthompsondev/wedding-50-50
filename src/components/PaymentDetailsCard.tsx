import { siteConfig } from "../config";
import { getFirstName } from "../lib/display";
import { formatCurrency } from "../lib/lottery";
import { CopyButton, SharePaymentButton } from "./ShareButtons";

export type Confirmation = {
  jarName: string;
  entryCount: number;
  amountDue: number;
};

export function PaymentDetailsCard({ confirmation, onStartOver }: { confirmation: Confirmation; onStartOver: () => void }) {
  const amount = formatCurrency(confirmation.amountDue);
  const entryLabel = `${confirmation.entryCount} ${confirmation.entryCount === 1 ? "entry" : "entries"}`;
  const copiedDetails = [
    "Ben & Tori’s Wedding 50/50",
    `Amount: ${amount}`,
    `Send to: ${siteConfig.eTransferAddress}`,
    `Entries: ${confirmation.entryCount}`,
  ].join("\n");

  return (
    <div className="confirmation-card" aria-live="polite">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">E-transfer details</p>
      <h3>Thanks, {getFirstName(confirmation.jarName)}. Your entries are recorded.</h3>
      <p>
        Send {amount} by e-transfer to {siteConfig.eTransferAddress}. Your entries have been recorded. Send the e-transfer when you’re ready, and we’ll check it off on our end.
      </p>
      <div className="confirmation-details">
        <div><span>Amount</span><strong>{amount}</strong></div>
        <div><span>Send to</span><strong>{siteConfig.eTransferAddress}</strong></div>
        <div><span>Entries</span><strong>{entryLabel}</strong></div>
      </div>
      <div className="copy-row">
        <CopyButton label="Copy email" value={siteConfig.eTransferAddress} />
        <CopyButton label="Copy amount" value={amount} />
        <CopyButton label="Copy payment details" value={copiedDetails} />
        <SharePaymentButton text={copiedDetails} />
      </div>
      <button className="text-button" type="button" onClick={onStartOver}>
        Add another name <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
