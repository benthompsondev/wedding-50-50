import { useEffect, useRef, useState, type FormEvent } from "react";
import { siteConfig } from "./config";
import {
  calculateAmountForQuantity,
  calculateSavingsForQuantity,
  createOrderId,
  createSubmissionGuard,
  formatCurrency,
  getCountdownParts,
  isConfigDate,
  isSalesClosed,
  padCountdownValue,
  parsePublicStatus,
  parseTicketQuantity,
  validateEntryForm,
  type CountdownParts,
  type EntryFormData,
  type EntryFormErrors,
  type PublicStatus,
} from "./lib/lottery";

const initialForm: EntryFormData = {
  fullName: "",
  email: "",
  phone: "",
  packageId: "quantity",
  ticketQuantity: "3",
  eTransferName: "",
  message: "",
  confirmed: false,
  honeypot: "",
};

type Confirmation = {
  buyerName: string;
  ticketQuantity: number;
  amountDue: number;
  orderId: string;
};

type SubmissionResponse = {
  ok?: boolean;
  message?: string;
  ticketQuantity?: number;
  amountDue?: number;
};

function scrollToSection(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function formatEventDate(value: string, fallback = "Date to be announced"): string {
  if (!isConfigDate(value)) return fallback;

  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function formatEventDateTime(value: string, fallback = "Date and time to be announced"): string {
  if (!isConfigDate(value)) return fallback;

  const date = new Date(value);
  const datePart = formatEventDate(value, fallback);
  const timePart = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  })
    .format(date)
    .replace(/\./g, "")
    .replace(/\s+/g, "");

  return `${datePart} at ${timePart.replace(":00", "")}`;
}

function formatLastUpdated(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(parsed);
}

function getFirstName(value: string): string {
  return value.trim().split(/\s+/)[0] || "there";
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

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

function ShareButton({ label = "Share this draw" }: { label?: string }) {
  const [status, setStatus] = useState("");

  async function share(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Ben & Tori’s Wedding 50/50",
          text: "Join Ben and Tori’s wedding 50/50: $10 each or 3 for $25.",
          url: siteConfig.publicWebsiteUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(siteConfig.publicWebsiteUrl);
        setStatus("Link copied");
        window.setTimeout(() => setStatus(""), 1800);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Copy the link from your browser");
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  return (
    <button className="copy-button share-button" type="button" onClick={share}>
      {status || label}
    </button>
  );
}

function PrizeCounter() {
  const [status, setStatus] = useState<PublicStatus | null>(null);

  useEffect(() => {
    const endpoint = siteConfig.appsScriptEndpoint.trim();
    if (!siteConfig.publicPrizeCounterEnabled || !endpoint) return undefined;

    let active = true;
    const separator = endpoint.includes("?") ? "&" : "?";

    fetch(`${endpoint}${separator}action=status`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Public status request failed");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (active) setStatus(parsePublicStatus(payload));
      })
      .catch(() => {
        if (active) setStatus(null);
      });

    return () => {
      active = false;
    };
  }, []);

  if (status) {
    return (
      <div className="prize-counter" aria-live="polite">
        <p className="eyebrow eyebrow-light">Prize so far</p>
        <p className="prize-number">{formatCurrency(status.winnerPrize)}</p>
        <p className="prize-description">
          Half of {formatCurrency(status.confirmedSales)} in confirmed ticket sales.
        </p>
        <p className="prize-meta">
          {status.confirmedTicketCount} confirmed tickets · Last updated {formatLastUpdated(status.lastUpdated)}
        </p>
      </div>
    );
  }

  return (
    <div className="prize-counter" aria-live="polite">
      <p className="eyebrow eyebrow-light">The prize</p>
      <p className="prize-number prize-number-placeholder">Half the final pot</p>
      <p className="prize-description">The winner will receive half of the final confirmed total.</p>
      <p className="prize-meta">We’ll keep the total here as payments are confirmed.</p>
    </div>
  );
}

function ClosingCountdown({ salesClosed }: { salesClosed: boolean }) {
  const [countdown, setCountdown] = useState<CountdownParts | null>(() =>
    getCountdownParts(siteConfig.salesClosingDate),
  );

  useEffect(() => {
    if (!isConfigDate(siteConfig.salesClosingDate)) return undefined;

    const update = () => setCountdown(getCountdownParts(siteConfig.salesClosingDate));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!countdown) {
    return (
      <div className="countdown-placeholder">
        <span className="countdown-icon" aria-hidden="true">⌛</span>
        <div>
          <strong>Closing time coming soon</strong>
          <p>We’ll share the final timing here once it is set.</p>
        </div>
      </div>
    );
  }

  const countdownUnits: Array<[number, string]> = [
    [countdown.days, "days"],
    [countdown.hours, "hours"],
    [countdown.minutes, "minutes"],
    [countdown.seconds, "seconds"],
  ];

  return (
    <div className="countdown-wrap" aria-live="polite">
      <p className="eyebrow">{salesClosed ? "Sales have closed" : "Time left to enter"}</p>
      <div className="countdown" aria-label={salesClosed ? "Sales have closed" : "Countdown to ticket sales closing"}>
        {countdownUnits.map(([value, label]) => (
          <div className="countdown-unit" key={label}>
            <strong>{label === "days" ? value : padCountdownValue(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const quickChoices = [1, 3, 6, 9, 12];
  const quantity = parseTicketQuantity(value) ?? 1;
  const amount = calculateAmountForQuantity(quantity);
  const savings = calculateSavingsForQuantity(quantity);

  function adjustQuantity(delta: number): void {
    const current = parseTicketQuantity(value) ?? 1;
    onChange(String(Math.min(99, Math.max(1, current + delta))));
  }

  return (
    <div className="ticket-picker" aria-describedby={error ? "ticket-quantity-error" : undefined}>
      <div className="ticket-picker-heading">
        <div>
          <p className="eyebrow">Tickets</p>
          <h3>Choose a quantity</h3>
        </div>
        <span className="ticket-limit">1–99 tickets</span>
      </div>
      <p className="ticket-picker-copy">
        Tickets are $10 each or 3 for $25. The discount repeats for every group of three.
      </p>
      <div className="quick-select" role="group" aria-label="Quick ticket quantities">
        {quickChoices.map((choice) => (
          <button
            className={quantity === choice && parseTicketQuantity(value) !== null ? "quick-choice quick-choice-selected" : "quick-choice"}
            type="button"
            key={choice}
            aria-pressed={quantity === choice && parseTicketQuantity(value) !== null}
            onClick={() => onChange(String(choice))}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="quantity-control">
        <button
          className="quantity-stepper"
          type="button"
          aria-label="Remove one ticket"
          disabled={quantity <= 1 && parseTicketQuantity(value) !== null}
          onClick={() => adjustQuantity(-1)}
        >
          −
        </button>
        <label className="quantity-input-label" htmlFor="ticketQuantity">
          <span className="sr-only">Number of tickets</span>
          <input
            id="ticketQuantity"
            name="ticketQuantity"
            className="quantity-input"
            type="number"
            min="1"
            max="99"
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "ticket-quantity-error" : "ticket-quantity-help"}
          />
        </label>
        <button
          className="quantity-stepper"
          type="button"
          aria-label="Add one ticket"
          disabled={quantity >= 99 && parseTicketQuantity(value) !== null}
          onClick={() => adjustQuantity(1)}
        >
          +
        </button>
      </div>
      <p className="ticket-summary" id="ticket-quantity-help">
        <strong>{quantity} ticket{quantity === 1 ? "" : "s"}</strong> · {formatCurrency(amount)}
        {savings > 0 ? <span className="ticket-savings">You save {formatCurrency(savings)}</span> : null}
      </p>
      {error ? <span className="field-error" id="ticket-quantity-error">{error}</span> : null}
    </div>
  );
}

function ConfirmationCard({ confirmation, onStartOver }: { confirmation: Confirmation; onStartOver: () => void }) {
  const amount = formatCurrency(confirmation.amountDue);
  const quantityLabel = `${confirmation.ticketQuantity} ticket${confirmation.ticketQuantity === 1 ? "" : "s"}`;
  const copyAllValue = [
    `E-transfer recipient: ${siteConfig.eTransferAddress}`,
    `Amount: ${amount}`,
    `Ticket quantity: ${quantityLabel}`,
    `Order reference: ${confirmation.orderId}`,
  ].join("\n");

  return (
    <div className="confirmation-card" aria-live="polite">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">Payment details</p>
      <h3>All set, {getFirstName(confirmation.buyerName)}.</h3>
      <p>Send the exact e-transfer below. We’ll email your ticket numbers after the payment is confirmed.</p>

      <div className="confirmation-details">
        <div>
          <span>Send to</span>
          <strong>{siteConfig.eTransferAddress}</strong>
        </div>
        <div>
          <span>Amount</span>
          <strong>{amount}</strong>
        </div>
        <div>
          <span>Tickets</span>
          <strong>{quantityLabel}</strong>
        </div>
        <div>
          <span>Order reference</span>
          <strong>{confirmation.orderId}</strong>
        </div>
      </div>

      <div className="copy-row">
        <CopyButton label="Copy e-transfer email" value={siteConfig.eTransferAddress} />
        <CopyButton label="Copy amount" value={amount} />
        <CopyButton label="Copy reference" value={confirmation.orderId} />
        <CopyButton label="Copy all" value={copyAllValue} />
        <ShareButton />
      </div>

      <div className="confirmation-note">
        Already sent it without the reference? No panic — message us and we’ll match it using your name and amount.
      </div>

      <button className="text-button" type="button" onClick={onStartOver}>
        Submit another entry <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function PreviewEntryCard({ salesClosed }: { salesClosed: boolean }) {
  return (
    <div className="form-card preview-card" aria-live="polite">
      <p className="eyebrow">{salesClosed ? "Ticket sales closed" : "Tickets opening soon"}</p>
      <h3>{salesClosed ? "Thanks for being part of it." : "We’re getting things ready."}</h3>
      <p>
        {salesClosed
          ? "We’ll share the winner after the draw."
          : "Choose your quantity above to preview the total. We’ll open the entry form here once ticket sales are ready."}
      </p>
    </div>
  );
}

function App() {
  const [form, setForm] = useState<EntryFormData>(initialForm);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const submissionGuard = useRef(createSubmissionGuard());
  const endpointConfigured = Boolean(siteConfig.appsScriptEndpoint.trim());
  const launchReady = isConfigDate(siteConfig.salesClosingDate) && isConfigDate(siteConfig.drawDate) && endpointConfigured;
  const salesClosed = isSalesClosed(siteConfig.salesClosingDate);
  const quantity = parseTicketQuantity(form.ticketQuantity) ?? 1;
  const amountDue = calculateAmountForQuantity(quantity);

  useEffect(() => {
    if (import.meta.env.DEV && !launchReady) {
      console.info("Wedding 50/50 is in preview mode locally until the payment endpoint is configured.");
    }
  }, [launchReady]);

  function updateField<Key extends keyof EntryFormData>(field: Key, value: EntryFormData[Key]): void {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function updateQuantity(value: string): void {
    setForm((current) => ({ ...current, packageId: "quantity", ticketQuantity: value }));
    if (errors.ticketQuantity) {
      setErrors((current) => ({ ...current, ticketQuantity: undefined }));
    }
  }

  function startOver(): void {
    submissionGuard.current.release();
    setConfirmation(null);
    setSubmitError("");
    window.setTimeout(() => scrollToSection("enter"), 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError("");

    if (!launchReady) return;

    if (salesClosed) {
      setSubmitError("Ticket sales have closed.");
      return;
    }

    const nextErrors = validateEntryForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError("Please check the highlighted fields before submitting.");
      return;
    }

    const localQuantity = parseTicketQuantity(form.ticketQuantity);
    if (localQuantity === null || !submissionGuard.current.acquire()) return;

    const orderId = createOrderId();
    setIsSubmitting(true);

    try {
      const response = await fetch(siteConfig.appsScriptEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          orderId,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          packageId: "quantity",
          ticketQuantity: localQuantity,
          quantity: localQuantity,
          eTransferName: form.eTransferName.trim(),
          message: form.message.trim(),
          confirmed: form.confirmed,
          honeypot: form.honeypot,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SubmissionResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message ?? "We could not save your ticket request. Please try again.");
      }

      const trustedQuantity = parseTicketQuantity(payload.ticketQuantity ?? localQuantity);
      const trustedAmount = typeof payload.amountDue === "number" ? payload.amountDue : amountDue;
      if (trustedQuantity === null || trustedAmount !== calculateAmountForQuantity(trustedQuantity)) {
        throw new Error("We could not confirm the ticket total. Please try again.");
      }

      setConfirmation({
        buyerName: form.fullName.trim(),
        ticketQuantity: trustedQuantity,
        amountDue: trustedAmount,
        orderId,
      });
      setForm({ ...initialForm, ticketQuantity: String(trustedQuantity) });
      setErrors({});
    } catch (error) {
      submissionGuard.current.release();
      setSubmitError(error instanceof Error ? error.message : "We could not submit the entry. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#top" aria-label="Back to the top">
            <span className="brand-mark" aria-hidden="true">✦</span>
            <span>Ben &amp; Tori</span>
            <small>50/50</small>
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#packages">Tickets</a>
            <a href="#how-it-works">How it works</a>
            <a href="#story">Why we’re doing this</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="header-link" href="#enter">Get tickets <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <main>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-media">
            <img
              src={siteConfig.photos.hero}
              alt="Ben and Tori beside their wedding pumpkin"
              width="2048"
              height="1367"
              fetchPriority="high"
            />
          </div>
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-content page-width">
            <p className="eyebrow eyebrow-light">For our favourite people</p>
            <h1 id="hero-title">Ben &amp; Tori’s <em>Wedding 50/50</em></h1>
            <p className="hero-lede">{siteConfig.tagline}</p>
            <div className="hero-actions">
              <button className="button button-gold" type="button" onClick={() => scrollToSection("packages")}>
                Get tickets <span aria-hidden="true">→</span>
              </button>
              <a className="button button-quiet" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">
                Our wedding website <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="hero-details">
              <span><strong>Draw {formatEventDate(siteConfig.drawDate)}</strong></span>
              <span><strong>$10 each or 3 for $25</strong></span>
              <span><strong>Winner takes half the pot</strong></span>
            </div>
          </div>
          <a className="hero-scroll" href="#prize">See how it works <span aria-hidden="true">↓</span></a>
        </section>

        <section className="section page-width prize-intro" id="prize" aria-labelledby="prize-title">
          <div className="section-heading section-heading-split">
            <div>
              <p className="eyebrow">The prize</p>
              <h2 id="prize-title">Winner takes half the pot.</h2>
            </div>
            <p>Every confirmed ticket adds to the final prize. We’ll show the total here as payments are confirmed.</p>
          </div>
          <div className="prize-panel">
            <PrizeCounter />
            <div className="prize-panel-note">
              <span className="note-icon" aria-hidden="true">✓</span>
              <p><strong>Simple payment.</strong> Send an Interac e-transfer after you submit, and we’ll email your ticket numbers once it is confirmed.</p>
            </div>
          </div>
        </section>

        <section className="section cream-section" id="packages" aria-labelledby="packages-title">
          <div className="page-width">
            <div className="section-heading">
              <p className="eyebrow">Tickets</p>
              <h2 id="packages-title">Pick your tickets</h2>
              <p>Choose a quantity below and we’ll show the total before you get to the form.</p>
            </div>
            <TicketPicker value={form.ticketQuantity ?? ""} error={errors.ticketQuantity} onChange={updateQuantity} />
            <div className="ticket-picker-actions">
              <button className="button button-primary" type="button" onClick={() => scrollToSection("enter")}>
                Get tickets <span aria-hidden="true">→</span>
              </button>
              <span>{quantity} ticket{quantity === 1 ? "" : "s"} · {formatCurrency(amountDue)}</span>
            </div>
            <p className="section-footnote"><span aria-hidden="true">✦</span> Winner takes half of the final confirmed pot.</p>
          </div>
        </section>

        <section className="section page-width" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading section-heading-narrow">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Four small steps, then you’re in.</h2>
          </div>
          <ol className="steps-grid">
            <li><span>01</span><h3>Complete the form</h3><p>Enter your name, email, and how many tickets you’d like.</p></li>
            <li><span>02</span><h3>Send your e-transfer</h3><p>Send the exact amount to {siteConfig.eTransferAddress} with your order reference.</p></li>
            <li><span>03</span><h3>We confirm it</h3><p>We’ll match your payment and assign your ticket numbers.</p></li>
            <li><span>04</span><h3>Watch the draw</h3><p>After sales close, we’ll randomly draw one confirmed ticket. We’ll record the draw and post the video here and on Facebook.</p></li>
          </ol>
        </section>

        <section className="section entry-section" id="enter" aria-labelledby="entry-title">
          <div className="page-width">
            <div className="section-heading section-heading-light">
              <p className="eyebrow eyebrow-light">Ticket request</p>
              <h2 id="entry-title">Get your tickets</h2>
              <p>Fill this out first and we’ll give you the e-transfer details.</p>
            </div>

            <div className="entry-layout">
              {confirmation ? (
                <ConfirmationCard confirmation={confirmation} onStartOver={startOver} />
              ) : !launchReady || salesClosed ? (
                <PreviewEntryCard salesClosed={salesClosed} />
              ) : (
                <form className="form-card" onSubmit={handleSubmit} noValidate>
                  <input type="hidden" name="ticketQuantity" value={form.ticketQuantity ?? ""} readOnly />
                  <div className="form-card-heading">
                    <div>
                      <p className="eyebrow">Your details</p>
                      <h3>Let’s get this started.</h3>
                    </div>
                    <span className="required-note">* required</span>
                  </div>

                  {submitError ? <p className="form-alert" role="alert">{submitError}</p> : null}

                  <div className="form-grid">
                    <div className="field field-span-2">
                      <label htmlFor="fullName">Full name <span aria-hidden="true">*</span></label>
                      <input id="fullName" name="fullName" type="text" autoComplete="name" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "fullName-error" : undefined} required />
                      {errors.fullName ? <span className="field-error" id="fullName-error">{errors.fullName}</span> : null}
                    </div>
                    <div className="field">
                      <label htmlFor="email">Email address <span aria-hidden="true">*</span></label>
                      <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} required />
                      {errors.email ? <span className="field-error" id="email-error">{errors.email}</span> : null}
                    </div>
                    <div className="field">
                      <label htmlFor="phone">Phone <span className="optional">optional</span></label>
                      <input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                    </div>
                    <div className="field field-span-2">
                      <label htmlFor="eTransferName">Name on e-transfer <span aria-hidden="true">*</span></label>
                      <input id="eTransferName" name="eTransferName" type="text" autoComplete="name" value={form.eTransferName} onChange={(event) => updateField("eTransferName", event.target.value)} aria-invalid={Boolean(errors.eTransferName)} aria-describedby={errors.eTransferName ? "eTransferName-error" : "eTransferName-help"} required />
                      <span className="field-help" id="eTransferName-help">This helps us match your payment if the bank account uses a different name.</span>
                      {errors.eTransferName ? <span className="field-error" id="eTransferName-error">{errors.eTransferName}</span> : null}
                    </div>
                    <div className="field field-span-2">
                      <label htmlFor="message">Message <span className="optional">optional</span></label>
                      <textarea id="message" name="message" rows={3} value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="A little note for us, if you’d like."></textarea>
                    </div>
                  </div>

                  <div className="selected-ticket-summary">
                    <div>
                      <span>Your tickets</span>
                      <strong>{quantity} ticket{quantity === 1 ? "" : "s"} · {formatCurrency(amountDue)}</strong>
                    </div>
                    <button className="text-button" type="button" onClick={() => scrollToSection("packages")}>Change quantity <span aria-hidden="true">↗</span></button>
                  </div>

                  <div className="honeypot" aria-hidden="true">
                    <label htmlFor="website">Leave this field empty</label>
                    <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(event) => updateField("honeypot", event.target.value)} />
                  </div>

                  <label className={`checkbox-row ${errors.confirmed ? "checkbox-row-error" : ""}`} htmlFor="confirmed">
                    <input id="confirmed" name="confirmed" type="checkbox" checked={form.confirmed} onChange={(event) => updateField("confirmed", event.target.checked)} aria-invalid={Boolean(errors.confirmed)} />
                    <span>I’ve checked my details and understand that ticket numbers are sent after payment is confirmed. <span aria-hidden="true">*</span></span>
                  </label>
                  {errors.confirmed ? <span className="field-error checkbox-error">{errors.confirmed}</span> : null}

                  <div className="form-submit-row">
                    <div>
                      <strong>{quantity} ticket{quantity === 1 ? "" : "s"}</strong>
                      <span>{formatCurrency(amountDue)} due</span>
                    </div>
                    <button className="button button-primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Sending…" : "Submit and get payment instructions"} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <p className="form-disclaimer">Your ticket numbers arrive by email after payment is confirmed.</p>
                </form>
              )}

              {launchReady && !salesClosed && !confirmation ? (
                <aside className="payment-card" aria-labelledby="payment-title">
                  <p className="eyebrow eyebrow-light">After you submit</p>
                  <h3 id="payment-title">Send the e-transfer.</h3>
                  <p>Use the exact amount and include your order reference in the transfer message.</p>
                  <div className="transfer-address">
                    <span>Send to</span>
                    <strong>{siteConfig.eTransferAddress}</strong>
                    <CopyButton label="Copy email" value={siteConfig.eTransferAddress} />
                  </div>
                  <div className="payment-summary">
                    <div><span>Tickets</span><strong>{quantity}</strong></div>
                    <div><span>Amount</span><strong>{formatCurrency(amountDue)}</strong></div>
                    <div><span>Transfer message</span><strong>Your order reference</strong></div>
                  </div>
                  <p className="payment-note"><span aria-hidden="true">✦</span> We’ll email your ticket numbers after the payment is matched.</p>
                </aside>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section page-width story-section" id="story" aria-labelledby="story-title">
          <div className="story-image-wrap">
            <img src={siteConfig.photos.family} alt="Ben and Tori sitting with Lily on the steps" width="1367" height="2048" loading="lazy" />
            <span className="image-stamp">Our little family</span>
          </div>
          <div className="story-copy">
            <p className="eyebrow">Why we’re doing this</p>
            <h2 id="story-title">A simple way to celebrate with us.</h2>
            <p>We decided to skip the stag and doe and do one 50/50 instead. Half the pot goes to the winner, and the other half helps us with the wedding.</p>
            <p>Lily is providing moral support, of course. Thanks for being part of this with us.</p>
            <a className="text-button" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">Our wedding details <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="section cream-section" id="draw" aria-labelledby="draw-title">
          <div className="page-width">
            <div className="section-heading section-heading-split">
              <div>
                <p className="eyebrow">Draw details</p>
                <h2 id="draw-title">Draw details</h2>
              </div>
              <p>After sales close, we’ll randomly draw one confirmed ticket. We’ll record the draw and post the video here and on Facebook.</p>
            </div>
            <div className="draw-grid">
              <div className="draw-card draw-card-featured"><span>Sales close</span><strong>{formatEventDateTime(siteConfig.salesClosingDate)}</strong><p>Payments must be confirmed before this time.</p></div>
              <div className="draw-card"><span>Draw</span><strong>{formatEventDateTime(siteConfig.drawDate)}</strong><p>We’ll record and share the draw here and on Facebook.</p></div>
              <div className="draw-card"><span>Winner</span><strong>{siteConfig.winnerAnnouncement.announced ? `${siteConfig.winnerAnnouncement.firstName} ${siteConfig.winnerAnnouncement.lastInitial}.` : "Half of confirmed pot"}</strong><p>{siteConfig.winnerAnnouncement.announced ? `Ticket ${siteConfig.winnerAnnouncement.winningTicketNumber}.` : "The winner takes half of the final confirmed total."}</p></div>
            </div>
            {!siteConfig.winnerAnnouncement.announced ? <p className="draw-status">The draw is scheduled for {formatEventDateTime(siteConfig.drawDate)}.</p> : null}
            {siteConfig.winnerAnnouncement.announced && siteConfig.winnerAnnouncement.finalPrize !== null ? <p className="draw-status">Final prize: {formatCurrency(siteConfig.winnerAnnouncement.finalPrize)}.</p> : null}
            <div className="draw-actions">
              <ShareButton />
              {siteConfig.drawVideoUrl ? <a className="button button-outline" href={siteConfig.drawVideoUrl} target="_blank" rel="noreferrer">Watch the draw video <span aria-hidden="true">↗</span></a> : null}
            </div>
            <ClosingCountdown salesClosed={salesClosed} />
          </div>
        </section>

        <section className="section page-width faq-section" id="faq" aria-labelledby="faq-title">
          <div className="section-heading section-heading-narrow">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title">The useful details.</h2>
          </div>
          <div className="faq-list">
            <details><summary>How much are tickets?</summary><p>Tickets are $10 each. Every three tickets cost $25.</p></details>
            <details><summary>How do I pay?</summary><p>Fill out the form, then send the exact amount by Interac e-transfer to {siteConfig.eTransferAddress}. Include your order reference.</p></details>
            <details><summary>When will I get my ticket numbers?</summary><p>Once payment is confirmed, we’ll email your ticket numbers.</p></details>
            <details><summary>What if I forget my order reference?</summary><p>No panic. Message us with your name and the amount and we’ll match it.</p></details>
            <details><summary>How is the winner picked?</summary><p>One confirmed ticket is drawn at random after sales close.</p></details>
            <details><summary>How will the winner be contacted?</summary><p>We’ll contact the winner directly and share their first name and last initial here.</p></details>
            <details><summary>What about a late payment?</summary><p>Only payments confirmed by the closing time can be included.</p></details>
          </div>
        </section>

        <section className="photo-strip" aria-label="A few favourite photos of Ben, Tori, and Lily">
          <div className="photo-strip-inner">
            {siteConfig.photos.gallery.map((photo) => <img key={photo.src} src={photo.src} alt={photo.alt} loading="lazy" />)}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-inner">
          <div>
            <a className="brand brand-footer" href="#top"><span className="brand-mark" aria-hidden="true">✦</span><span>Ben &amp; Tori</span></a>
            <p>{siteConfig.weddingDate} · {siteConfig.location}</p>
          </div>
          <div className="footer-links">
            <a href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">Wedding website <span aria-hidden="true">↗</span></a>
            <a href={`mailto:${siteConfig.eTransferAddress}`}>Contact us</a>
          </div>
        </div>
        <div className="page-width footer-bottom"><span>Made with love for our favourite people.</span><span>Ben &amp; Tori’s Wedding 50/50</span></div>
      </footer>
    </div>
  );
}

export default App;
