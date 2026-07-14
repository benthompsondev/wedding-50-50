import type { FormEventHandler } from "react";
import { siteConfig } from "../config";
import { formatCurrency, type BackendReadiness, type EntryFormData, type EntryFormErrors } from "../lib/lottery";
import { scrollToSection } from "../lib/display";
import { CopyButton } from "./ShareButtons";

type EntryFormProps = {
  amountDue: number;
  entryCount: number;
  errors: EntryFormErrors;
  form: EntryFormData;
  isSubmitting: boolean;
  submitError: string;
  onFieldChange: (field: keyof EntryFormData, value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function EntryForm({
  amountDue,
  entryCount,
  errors,
  form,
  isSubmitting,
  submitError,
  onFieldChange,
  onSubmit,
}: EntryFormProps) {
  return (
    <form className="form-card" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="entryCount" value={form.entryCount} readOnly />
      <div className="form-card-heading">
        <h3>Your details</h3>
        <span className="required-note">* required</span>
      </div>

      {submitError ? <p className="form-alert" role="alert">{submitError}</p> : null}

      <div className="form-grid">
        <div className="field field-span-2">
          <label htmlFor="jarName">Name for the jar <span aria-hidden="true">*</span></label>
          <input id="jarName" name="jarName" type="text" autoComplete="name" value={form.jarName} onChange={(event) => onFieldChange("jarName", event.target.value)} aria-invalid={Boolean(errors.jarName)} aria-describedby={errors.jarName ? "jarName-error" : "jarName-help"} required />
          <span className="field-help" id="jarName-help">This is the name we’ll write on each of your slips.</span>
          {errors.jarName ? <span className="field-error" id="jarName-error">{errors.jarName}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="email">Email address <span aria-hidden="true">*</span></label>
          <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => onFieldChange("email", event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} required />
          {errors.email ? <span className="field-error" id="email-error">{errors.email}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">Phone <span className="optional">optional</span></label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => onFieldChange("phone", event.target.value)} />
        </div>
        <div className="field field-span-2">
          <label htmlFor="eTransferName">Name the e-transfer will come from <span aria-hidden="true">*</span></label>
          <input id="eTransferName" name="eTransferName" type="text" autoComplete="name" value={form.eTransferName} onChange={(event) => onFieldChange("eTransferName", event.target.value)} aria-invalid={Boolean(errors.eTransferName)} aria-describedby={errors.eTransferName ? "eTransferName-error" : "eTransferName-help"} required />
          <span className="field-help" id="eTransferName-help">So we know which payment is yours.</span>
          {errors.eTransferName ? <span className="field-error" id="eTransferName-error">{errors.eTransferName}</span> : null}
        </div>
        <div className="field field-span-2">
          <label htmlFor="message">Message for Ben and Tori <span className="optional">optional</span></label>
          <textarea id="message" name="message" rows={3} value={form.message} onChange={(event) => onFieldChange("message", event.target.value)} placeholder="A quick note, if you’d like."></textarea>
        </div>
      </div>

      <div className="selected-ticket-summary">
        <div><span>Your entries</span><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"} · {formatCurrency(amountDue)}</strong></div>
        <button className="text-button" type="button" onClick={() => scrollToSection("entries")}>Change entries <span aria-hidden="true">↗</span></button>
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(event) => onFieldChange("honeypot", event.target.value)} />
      </div>

      <div className="form-submit-row">
        <div><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"}</strong><span>{formatCurrency(amountDue)} to send</span></div>
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "One sec…" : "Show e-transfer details"} <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

export function PreviewEntryCard({ salesClosed, backendReadiness }: { salesClosed: boolean; backendReadiness: BackendReadiness }) {
  const content = salesClosed
    ? { eyebrow: "Entries are closed", title: "Thanks for joining in.", body: "We’ll post the winner and video here after the draw." }
    : backendReadiness === "checking"
      ? { eyebrow: "Getting the entry form ready…", title: "One quick moment.", body: "We’re making sure everything is ready before we open the form." }
      : backendReadiness === "unavailable"
        ? { eyebrow: "Entries are temporarily unavailable", title: "The jar needs a quick reset.", body: "The entry form is having a moment. Try refreshing, or message us if it keeps happening." }
        : { eyebrow: "Entries opening soon", title: "We’re getting the jar ready.", body: "You can try the entry picker above. The form will open here when we’re ready to start accepting e-transfers." };

  return (
    <div className="form-card preview-card" aria-live="polite">
      <p className="eyebrow">{content.eyebrow}</p>
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
}

export function PaymentSummaryCard({ amountDue, entryCount }: { amountDue: number; entryCount: number }) {
  return (
    <aside className="payment-card" aria-labelledby="payment-title">
      <p className="eyebrow eyebrow-light">After you submit</p>
      <h3 id="payment-title">We’ll show you what to send.</h3>
      <p>We’ll show you the exact amount and the e-transfer email.</p>
      <div className="transfer-address">
        <span>Send to</span>
        <strong>{siteConfig.eTransferAddress}</strong>
        <CopyButton label="Copy email" value={siteConfig.eTransferAddress} />
      </div>
      <div className="payment-summary">
        <div><span>Entries</span><strong>{entryCount}</strong></div>
        <div><span>Amount</span><strong>{formatCurrency(amountDue)}</strong></div>
      </div>
      <p className="payment-note"><span aria-hidden="true">✦</span> Once you submit, we’ll record your entries. We’ll check the e-transfer before the draw.</p>
    </aside>
  );
}
