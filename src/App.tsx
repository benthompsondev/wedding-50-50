import { useEffect, useRef, useState, type FormEvent } from "react";
import { siteConfig, ticketPackages } from "./config";
import {
  calculateAmountDue,
  calculateTicketCount,
  createOrderId,
  createSubmissionGuard,
  formatCurrency,
  getCountdownParts,
  getPackageById,
  isConfigDate,
  isSalesClosed,
  parsePublicStatus,
  padCountdownValue,
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
  packageId: "triple",
  eTransferName: "",
  message: "",
  confirmed: false,
  honeypot: "",
};

type Confirmation = {
  buyerName: string;
  packageDisplay: string;
  amountDue: number;
  orderId: string;
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

function formatLastUpdated(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(parsed);
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
        if (!active) return;
        setStatus(parsePublicStatus(payload));
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
        <p className="eyebrow eyebrow-light">The current estimated prize</p>
        <p className="prize-number">{formatCurrency(status.winnerPrize)}</p>
        <p className="prize-description">
          That is 50% of {formatCurrency(status.confirmedSales)} in confirmed ticket sales.
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
      <p className="prize-number prize-number-placeholder">Updates after launch</p>
      <p className="prize-description">{siteConfig.prizeFallbackText}</p>
      <p className="prize-meta">Confirmed sales will be reflected here once the public summary is connected.</p>
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
          <strong>Closing date to be announced</strong>
          <p>Ben and Tori will update this section when the final sales deadline is set.</p>
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

function PackageCard({
  packageId,
  selected,
  onSelect,
}: {
  packageId: "single" | "triple";
  selected: boolean;
  onSelect: (packageId: "single" | "triple") => void;
}) {
  const ticketPackage = getPackageById(packageId);
  if (!ticketPackage) return null;

  return (
    <article className={`package-card ${selected ? "package-card-selected" : ""}`}>
      <div className="package-card-topline">
        <span className="package-kicker">{packageId === "triple" ? "Most popular" : "Start here"}</span>
        {selected ? <span className="selected-badge">Selected</span> : null}
      </div>
      <p className="package-price">{ticketPackage.priceLabel}</p>
      <h3>{ticketPackage.label}</h3>
      <p>{ticketPackage.detail}</p>
      <button className="button button-outline" type="button" onClick={() => onSelect(packageId)}>
        Choose {ticketPackage.label.toLowerCase()} <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function ConfirmationCard({ confirmation, onStartOver }: { confirmation: Confirmation; onStartOver: () => void }) {
  return (
    <div className="confirmation-card" aria-live="polite">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">Entry request received</p>
      <h3>Thank you, {confirmation.buyerName.split(" ")[0]}.</h3>
      <p>
        Your entry request has been received. Please send your e-transfer to {siteConfig.eTransferAddress} and include
        your order reference in the transfer message.
      </p>

      <div className="confirmation-details">
        <div>
          <span>Package</span>
          <strong>{confirmation.packageDisplay}</strong>
        </div>
        <div>
          <span>Amount due</span>
          <strong>{formatCurrency(confirmation.amountDue)}</strong>
        </div>
        <div>
          <span>Order reference</span>
          <strong>{confirmation.orderId}</strong>
        </div>
      </div>

      <div className="copy-row">
        <CopyButton label="Copy order reference" value={confirmation.orderId} />
        <CopyButton label="Copy e-transfer address" value={siteConfig.eTransferAddress} />
      </div>

      <div className="confirmation-note">
        <strong>One important step:</strong> submitting the form alone does not create valid ticket entries. Your ticket
        numbers will be emailed after Ben or Tori confirms your payment.
      </div>

      <button className="text-button" type="button" onClick={onStartOver}>
        Submit another entry <span aria-hidden="true">→</span>
      </button>
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
  const salesClosed = isSalesClosed(siteConfig.salesClosingDate);
  const selectedPackage = getPackageById(form.packageId) ?? ticketPackages[0];

  function updateField<Key extends keyof EntryFormData>(field: Key, value: EntryFormData[Key]): void {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function choosePackage(packageId: "single" | "triple"): void {
    updateField("packageId", packageId);
    window.setTimeout(() => scrollToSection("enter"), 0);
  }

  function startOver(): void {
    setConfirmation(null);
    setSubmitError("");
    window.setTimeout(() => scrollToSection("enter"), 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError("");

    if (salesClosed) {
      setSubmitError("Ticket sales have closed. Please check back for the winner announcement.");
      return;
    }

    const nextErrors = validateEntryForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError("Please check the highlighted fields before submitting.");
      return;
    }

    if (!submissionGuard.current.acquire()) return;

    const orderId = createOrderId();
    const packageDisplay = selectedPackage.label;
    setIsSubmitting(true);

    if (!siteConfig.appsScriptEndpoint.trim()) {
      setSubmitError("The entry form is ready, but the Google Apps Script endpoint has not been added yet. No request was sent.");
      submissionGuard.current.release();
      setIsSubmitting(false);
      return;
    }

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
          packageId: form.packageId,
          eTransferName: form.eTransferName.trim(),
          message: form.message.trim(),
          confirmed: form.confirmed,
          honeypot: form.honeypot,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message ?? "The entry request was not accepted.");
      }

      setConfirmation({
        buyerName: form.fullName.trim(),
        packageDisplay,
        amountDue: calculateAmountDue(form.packageId),
        orderId,
      });
      setForm({ ...initialForm, packageId: form.packageId });
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
            <a href="#story">Our story</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="header-link" href="#enter">Enter the draw <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <main>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-media">
            <img
              src={siteConfig.photos.hero}
              alt="Ben and Tori leaning beside a pumpkin marked with their October wedding date"
              width="2048"
              height="1367"
              fetchPriority="high"
            />
          </div>
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-content page-width">
            <p className="eyebrow eyebrow-light">A little celebration before the big day</p>
            <h1 id="hero-title">Ben &amp; Tori’s <em>Wedding 50/50</em></h1>
            <p className="hero-lede">{siteConfig.tagline}</p>
            <div className="hero-actions">
              <button className="button button-gold" type="button" onClick={() => scrollToSection("packages")}>
                Enter the draw <span aria-hidden="true">→</span>
              </button>
              <a className="button button-quiet" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">
                Visit our wedding website <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="hero-details">
              <span><strong>{siteConfig.weddingDate}</strong> wedding day</span>
              <span><strong>{siteConfig.location}</strong></span>
              <span><strong>50%</strong> of confirmed sales is the prize</span>
            </div>
          </div>
          <a className="hero-scroll" href="#prize">Scroll to see how it works <span aria-hidden="true">↓</span></a>
        </section>

        <section className="intro-band">
          <div className="page-width intro-band-inner">
            <p className="eyebrow">A simple way to join in</p>
            <p className="intro-copy">Buy a ticket, send your e-transfer, and you’ll be in the running for half the pot. The other half helps us get ready for October 10, 2026.</p>
            <span className="intro-spark" aria-hidden="true">✦</span>
          </div>
        </section>

        <section className="section page-width prize-intro" id="prize" aria-labelledby="prize-title">
          <div className="section-heading section-heading-split">
            <div>
              <p className="eyebrow">The current prize</p>
              <h2 id="prize-title">Good luck looks better when it helps make a wedding happen.</h2>
            </div>
            <p>Every confirmed ticket makes the final prize bigger. We’ll keep the public total simple and transparent as payments are confirmed.</p>
          </div>
          <div className="prize-panel">
            <PrizeCounter />
            <div className="prize-panel-note">
              <span className="note-icon" aria-hidden="true">✓</span>
              <p><strong>No card details. No accounts.</strong> Payment happens separately by Interac e-transfer, and tickets are issued after payment confirmation.</p>
            </div>
          </div>
        </section>

        <section className="section cream-section" id="packages" aria-labelledby="packages-title">
          <div className="page-width">
            <div className="section-heading">
              <p className="eyebrow">Choose your chance</p>
              <h2 id="packages-title">Two easy ways to play.</h2>
              <p>Pick a package below and we’ll take you straight to the entry form with the amount already filled in.</p>
            </div>
            <div className="package-grid">
              <PackageCard packageId="single" selected={form.packageId === "single"} onSelect={choosePackage} />
              <PackageCard packageId="triple" selected={form.packageId === "triple"} onSelect={choosePackage} />
            </div>
            <p className="section-footnote"><span aria-hidden="true">✦</span> The winner receives 50% of all confirmed ticket sales.</p>
          </div>
        </section>

        <section className="section page-width" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading section-heading-narrow">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Four small steps, then you’re in.</h2>
          </div>
          <ol className="steps-grid">
            <li><span>01</span><h3>Complete the form</h3><p>Tell us who to connect to the order and choose your ticket package.</p></li>
            <li><span>02</span><h3>Send your e-transfer</h3><p>Send the exact amount to {siteConfig.eTransferAddress} with your order reference.</p></li>
            <li><span>03</span><h3>We confirm it</h3><p>Ben or Tori matches the payment to your request and assigns your ticket numbers.</p></li>
            <li><span>04</span><h3>Watch the draw</h3><p>After sales close, one eligible ticket is selected and the winner is contacted.</p></li>
          </ol>
        </section>

        <section className="section entry-section" id="enter" aria-labelledby="entry-title">
          <div className="page-width">
            <div className="section-heading section-heading-light">
              <p className="eyebrow eyebrow-light">Ready when you are</p>
              <h2 id="entry-title">Enter the wedding 50/50.</h2>
              <p>Fill this out first, then send the matching e-transfer. We’ll email your ticket numbers once the payment is confirmed.</p>
            </div>

            <div className="entry-layout">
              {confirmation ? (
                <ConfirmationCard confirmation={confirmation} onStartOver={startOver} />
              ) : (
                <form className="form-card" onSubmit={handleSubmit} noValidate>
                  <div className="form-card-heading">
                    <div>
                      <p className="eyebrow">Your entry request</p>
                      <h3>Let’s get you on the list.</h3>
                    </div>
                    <span className="required-note">* required</span>
                  </div>

                  {submitError ? <p className="form-alert" role="alert">{submitError}</p> : null}
                  {salesClosed ? <p className="form-alert" role="alert">Ticket sales are closed. The winner announcement will be posted below.</p> : null}

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
                      <label htmlFor="phone">Phone number <span className="optional">optional</span></label>
                      <input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="packageId">Ticket package <span aria-hidden="true">*</span></label>
                      <select id="packageId" name="packageId" value={form.packageId} onChange={(event) => updateField("packageId", event.target.value)} aria-invalid={Boolean(errors.packageId)} aria-describedby={errors.packageId ? "packageId-error" : undefined} required>
                        {ticketPackages.map((ticketPackage) => <option value={ticketPackage.id} key={ticketPackage.id}>{ticketPackage.label} — {ticketPackage.priceLabel}</option>)}
                      </select>
                      {errors.packageId ? <span className="field-error" id="packageId-error">{errors.packageId}</span> : null}
                    </div>
                    <div className="field">
                      <label htmlFor="eTransferName">Name on e-transfer <span aria-hidden="true">*</span></label>
                      <input id="eTransferName" name="eTransferName" type="text" autoComplete="name" value={form.eTransferName} onChange={(event) => updateField("eTransferName", event.target.value)} aria-invalid={Boolean(errors.eTransferName)} aria-describedby={errors.eTransferName ? "eTransferName-error" : undefined} required />
                      {errors.eTransferName ? <span className="field-error" id="eTransferName-error">{errors.eTransferName}</span> : null}
                    </div>
                    <div className="field field-span-2">
                      <label htmlFor="message">Message to Ben and Tori <span className="optional">optional</span></label>
                      <textarea id="message" name="message" rows={3} value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="A little note for us, if you’d like."></textarea>
                    </div>
                  </div>

                  <div className="honeypot" aria-hidden="true">
                    <label htmlFor="website">Leave this field empty</label>
                    <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(event) => updateField("honeypot", event.target.value)} />
                  </div>

                  <label className={`checkbox-row ${errors.confirmed ? "checkbox-row-error" : ""}`} htmlFor="confirmed">
                    <input id="confirmed" name="confirmed" type="checkbox" checked={form.confirmed} onChange={(event) => updateField("confirmed", event.target.checked)} aria-invalid={Boolean(errors.confirmed)} />
                    <span>I’ve checked my details and understand that ticket numbers are issued only after payment is confirmed. <span aria-hidden="true">*</span></span>
                  </label>
                  {errors.confirmed ? <span className="field-error checkbox-error">{errors.confirmed}</span> : null}

                  <div className="form-submit-row">
                    <div>
                      <strong>{selectedPackage.label}</strong>
                      <span>{calculateTicketCount(form.packageId)} eligible chance{calculateTicketCount(form.packageId) === 1 ? "" : "s"} · {formatCurrency(calculateAmountDue(form.packageId))} due</span>
                    </div>
                    <button className="button button-primary" type="submit" disabled={isSubmitting || salesClosed}>
                      {isSubmitting ? "Sending…" : "Submit entry request"} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <p className="form-disclaimer">Submitting this form does not create valid ticket entries. Please wait for your payment confirmation email.</p>
                </form>
              )}

              <aside className="payment-card" aria-labelledby="payment-title">
                <p className="eyebrow eyebrow-light">Your payment step</p>
                <h3 id="payment-title">Send the e-transfer after submitting.</h3>
                <p>Use the exact amount below and include your order reference in the transfer message.</p>
                <div className="transfer-address">
                  <span>Send to</span>
                  <strong>{siteConfig.eTransferAddress}</strong>
                  <CopyButton label="Copy address" value={siteConfig.eTransferAddress} />
                </div>
                <div className="payment-summary">
                  <div><span>Selected package</span><strong>{selectedPackage.label}</strong></div>
                  <div><span>Amount to send</span><strong>{formatCurrency(calculateAmountDue(form.packageId))}</strong></div>
                  <div><span>Transfer message</span><strong>{confirmation?.orderId ?? "Your order reference"}</strong></div>
                </div>
                <p className="payment-note"><span aria-hidden="true">✦</span> Ticket numbers are emailed after payment is matched and confirmed.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="section page-width story-section" id="story" aria-labelledby="story-title">
          <div className="story-image-wrap">
            <img src={siteConfig.photos.family} alt="Ben and Tori sitting with Lily on the steps" width="1367" height="2048" loading="lazy" />
            <span className="image-stamp">Our little family</span>
          </div>
          <div className="story-copy">
            <p className="eyebrow">Ben, Tori &amp; Lily</p>
            <h2 id="story-title">A small fundraiser for a very big next chapter.</h2>
            <p>We decided to skip the traditional stag and doe and instead create a simple wedding 50/50 for our friends and family.</p>
            <p>Thank you for supporting us as we get ready for October 10, 2026. Your love, encouragement, and excitement already mean so much to us.</p>
            <a className="text-button" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">See our wedding details <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="section cream-section" id="draw" aria-labelledby="draw-title">
          <div className="page-width">
            <div className="section-heading section-heading-split">
              <div>
                <p className="eyebrow">Draw details</p>
                <h2 id="draw-title">Clear dates. One eligible ticket. A simple finish.</h2>
              </div>
              <p>We’ll publish the final winner details here after the draw is complete. Until then, every paid order is tracked privately in the ticket ledger.</p>
            </div>
            <div className="draw-grid">
              <div className="draw-card draw-card-featured"><span>Sales close</span><strong>{formatEventDate(siteConfig.salesClosingDate, "To be announced")}</strong><p>Only confirmed payments received before the closing time are eligible.</p></div>
              <div className="draw-card"><span>Draw date</span><strong>{formatEventDate(siteConfig.drawDate, "To be announced")}</strong><p>The exact draw timing will be shared once it is finalized.</p></div>
              <div className="draw-card"><span>Winner</span><strong>{siteConfig.winnerAnnouncement.announced ? `${siteConfig.winnerAnnouncement.firstName} ${siteConfig.winnerAnnouncement.lastInitial}.` : "Winner to be announced"}</strong><p>{siteConfig.winnerAnnouncement.announced ? `Winning ticket ${siteConfig.winnerAnnouncement.winningTicketNumber}.` : "The winner will be contacted using the confirmed order details."}</p></div>
            </div>
            <div className="draw-outcome">
              <div><span>Final confirmed prize</span><strong>{siteConfig.winnerAnnouncement.announced && siteConfig.winnerAnnouncement.finalPrize !== null ? formatCurrency(siteConfig.winnerAnnouncement.finalPrize) : "Pending final draw"}</strong></div>
              <div><span>Winning ticket number</span><strong>{siteConfig.winnerAnnouncement.announced ? siteConfig.winnerAnnouncement.winningTicketNumber : "To be announced"}</strong></div>
            </div>
            <ClosingCountdown salesClosed={salesClosed} />
          </div>
        </section>

        <section className="section page-width faq-section" id="faq" aria-labelledby="faq-title">
          <div className="section-heading section-heading-narrow">
            <p className="eyebrow">Questions, answered</p>
            <h2 id="faq-title">The useful details.</h2>
          </div>
          <div className="faq-list">
            <details><summary>How much are tickets?</summary><p>One ticket is $10. Three tickets are $25.</p></details>
            <details><summary>How do I pay?</summary><p>Submit the entry form first, then send the matching amount by Interac e-transfer to {siteConfig.eTransferAddress}. Include your order reference in the transfer message.</p></details>
            <details><summary>When will I receive my ticket numbers?</summary><p>After Ben or Tori confirms your payment, your ticket numbers will be emailed to you. Submitting the form by itself does not create valid entries.</p></details>
            <details><summary>What happens if I forget my order reference?</summary><p>Send the e-transfer anyway, then contact us at {siteConfig.eTransferAddress} with the sender name, amount, and email used on the form so we can match it safely.</p></details>
            <details><summary>How is the winner selected?</summary><p>After sales close, the eligible paid-ticket ledger is frozen and one ticket is selected from the confirmed entries. Refunded and cancelled orders are not eligible.</p></details>
            <details><summary>How will the winner be contacted?</summary><p>The winner will be contacted using the confirmed email address from the ticket order, and the first name plus last initial will be posted here.</p></details>
            <details><summary>What happens if my transfer arrives after sales close?</summary><p>We’ll review it with the closing time in mind. A payment received after the deadline is not automatically eligible and may need to be returned or handled according to the final draw rules.</p></details>
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
