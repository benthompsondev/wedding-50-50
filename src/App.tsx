import { useEffect, useRef, useState, type FormEvent } from "react";
import { siteConfig } from "./config";
import {
  calculateAmountForEntryCount,
  createInternalOrderId,
  createSubmissionGuard,
  formatCurrency,
  getInitialBackendReadiness,
  getCountdownParts,
  getWrappedPhotoIndex,
  isConfigDate,
  isLaunchReady,
  isSalesClosed,
  padCountdownValue,
  parseEntryCount,
  parsePublicStatus,
  validateEntryForm,
  type CountdownParts,
  type BackendReadiness,
  type EntryFormData,
  type EntryFormErrors,
  type PublicStatus,
} from "./lib/lottery";

const initialForm: EntryFormData = {
  jarName: "",
  email: "",
  phone: "",
  entryCount: "3",
  eTransferName: "",
  message: "",
  honeypot: "",
};

type Confirmation = {
  jarName: string;
  entryCount: number;
  amountDue: number;
};

type SubmissionResponse = {
  ok?: boolean;
  message?: string;
  entryCount?: number;
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
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(new Date(value));
  return `${formatEventDate(value, fallback)} at ${time}`;
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

function ShareDrawButton() {
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

function SharePaymentButton({ text }: { text: string }) {
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

function PrizeCounter({ status }: { status: PublicStatus | null }) {
  if (status) {
    return (
      <div className="prize-counter" aria-live="polite">
        <p className="eyebrow eyebrow-light">Prize so far</p>
        <p className="prize-number">{formatCurrency(status.winnerPrize)}</p>
        <p className="prize-description">Based on {formatCurrency(status.confirmedSales)} collected so far.</p>
        <p className="prize-meta">
          {status.confirmedEntryCount} name{status.confirmedEntryCount === 1 ? "" : "s"} in the jar · Updated {formatLastUpdated(status.lastUpdated)}
        </p>
      </div>
    );
  }

  return (
    <div className="prize-counter" aria-live="polite">
      <p className="eyebrow eyebrow-light">The prize</p>
      <p className="prize-number prize-number-placeholder">Half the final pot</p>
      <p className="prize-description">The winner will get half of the final pot.</p>
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

  if (!countdown) return null;

  const units: Array<[number, string]> = [
    [countdown.days, "days"],
    [countdown.hours, "hours"],
    [countdown.minutes, "minutes"],
    [countdown.seconds, "seconds"],
  ];

  return (
    <div className="countdown-wrap" aria-live="polite">
      <p className="eyebrow">{salesClosed ? "Entries are closed" : "Time left"}</p>
      <div className="countdown" aria-label={salesClosed ? "Entries are closed" : "Countdown to entries closing"}>
        {units.map(([value, label]) => (
          <div className="countdown-unit" key={label}>
            <strong>{label === "days" ? value : padCountdownValue(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const quickChoices = [1, 3, 6, 9, 12];
  const parsed = parseEntryCount(value);
  const entryCount = parsed ?? 1;
  const amount = calculateAmountForEntryCount(entryCount);

  function adjust(delta: number): void {
    const current = parseEntryCount(value) ?? 1;
    onChange(String(Math.min(99, Math.max(1, current + delta))));
  }

  return (
    <div className="ticket-picker" aria-describedby={error ? "entry-count-error" : undefined}>
      <div className="ticket-picker-heading">
        <div>
          <p className="eyebrow">Entries</p>
          <h3>Choose your entries</h3>
        </div>
        <span className="ticket-limit">1–99 entries</span>
      </div>
      <p className="ticket-picker-copy">
        Entries are $10 each or 3 for $25. Every entry puts your name in the jar once.
      </p>
      <div className="quick-select" role="group" aria-label="Quick entry quantities">
        {quickChoices.map((choice) => (
          <button
            className={parsed === choice ? "quick-choice quick-choice-selected" : "quick-choice"}
            type="button"
            key={choice}
            aria-pressed={parsed === choice}
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
          aria-label="Remove one entry"
          disabled={parsed === 1}
          onClick={() => adjust(-1)}
        >
          −
        </button>
        <label className="quantity-input-label" htmlFor="entryCount">
          <span className="sr-only">Number of entries</span>
          <input
            id="entryCount"
            name="entryCount"
            className="quantity-input"
            type="number"
            min="1"
            max="99"
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "entry-count-error" : "entry-count-help"}
          />
        </label>
        <button
          className="quantity-stepper"
          type="button"
          aria-label="Add one entry"
          disabled={parsed === 99}
          onClick={() => adjust(1)}
        >
          +
        </button>
      </div>
      <p className="ticket-summary" id="entry-count-help">
        {parsed === null ? (
          "Choose a whole number from 1 to 99."
        ) : (
          <><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"}</strong> · {formatCurrency(amount)}</>
        )}
      </p>
      {error ? <span className="field-error" id="entry-count-error">{error}</span> : null}
    </div>
  );
}

function PaymentDetailsCard({ confirmation, onStartOver }: { confirmation: Confirmation; onStartOver: () => void }) {
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
      <h3>Thanks, {getFirstName(confirmation.jarName)}. You’re almost in.</h3>
      <p>
        Send {amount} by e-transfer to {siteConfig.eTransferAddress}. Once it arrives, we’ll put your name in the jar {confirmation.entryCount === 1 ? "once" : `${confirmation.entryCount} times`}.
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

function PreviewEntryCard({ salesClosed, backendReadiness }: { salesClosed: boolean; backendReadiness: BackendReadiness }) {
  const content = salesClosed
    ? {
        eyebrow: "Entries are closed",
        title: "Thanks for joining in.",
        body: "We’ll post the winner and video here after the draw.",
      }
    : backendReadiness === "checking"
      ? {
          eyebrow: "Getting the entry form ready…",
          title: "One quick moment.",
          body: "We’re making sure everything is ready before we open the form.",
        }
      : backendReadiness === "unavailable"
        ? {
            eyebrow: "Entries are temporarily unavailable",
            title: "The jar needs a quick reset.",
            body: "The entry form is having a moment. Try refreshing, or message us if it keeps happening.",
          }
        : {
            eyebrow: "Entries opening soon",
            title: "We’re getting the jar ready.",
            body: "You can try the entry picker above. The form will open here when we’re ready to start accepting e-transfers.",
          };

  return (
    <div className="form-card preview-card" aria-live="polite">
      <p className="eyebrow">{content.eyebrow}</p>
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
}

function App() {
  const [form, setForm] = useState<EntryFormData>(initialForm);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [publicStatus, setPublicStatus] = useState<PublicStatus | null>(null);
  const [backendReadiness, setBackendReadiness] = useState<BackendReadiness>(() =>
    getInitialBackendReadiness(
      siteConfig.salesClosingDate,
      siteConfig.drawDate,
      siteConfig.appsScriptEndpoint,
    ),
  );
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const submissionGuard = useRef(createSubmissionGuard());
  const photoButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null);
  const lightboxTriggerIndex = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const configurationReady = isLaunchReady(
    siteConfig.salesClosingDate,
    siteConfig.drawDate,
    siteConfig.appsScriptEndpoint,
  );
  const launchReady = configurationReady && backendReadiness === "ready";
  const salesClosed = isSalesClosed(siteConfig.salesClosingDate);
  const lightboxOpen = activePhotoIndex !== null;
  const parsedEntryCount = parseEntryCount(form.entryCount);
  const entryCount = parsedEntryCount ?? 1;
  const amountDue = calculateAmountForEntryCount(entryCount);

  useEffect(() => {
    if (!configurationReady) {
      setBackendReadiness("preview");
      setPublicStatus(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    const endpoint = siteConfig.appsScriptEndpoint.trim();
    const separator = endpoint.includes("?") ? "&" : "?";
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setBackendReadiness("checking");

    fetch(`${endpoint}${separator}action=status`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status request failed");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!active) return;
        const status = parsePublicStatus(payload);
        if (!status) throw new Error("Status response was invalid");
        setPublicStatus(status);
        setBackendReadiness("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPublicStatus(null);
        setBackendReadiness("unavailable");
        if (import.meta.env.DEV) console.warn("Wedding 50/50 backend health check failed.", error);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [configurationReady]);

  useEffect(() => {
    if (import.meta.env.DEV && backendReadiness === "preview") {
      console.info("Wedding 50/50 preview mode is active locally.");
    }
  }, [backendReadiness]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => lightboxCloseRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setActivePhotoIndex(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActivePhotoIndex((current) => current === null ? null : getWrappedPhotoIndex(current, -1, siteConfig.photos.gallery.length));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActivePhotoIndex((current) => current === null ? null : getWrappedPhotoIndex(current, 1, siteConfig.photos.gallery.length));
        return;
      }
      if (event.key !== "Tab" || !lightboxRef.current) return;

      const focusable = Array.from(lightboxRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      photoButtonRefs.current[lightboxTriggerIndex.current]?.focus();
    };
  }, [lightboxOpen]);

  function openLightbox(index: number): void {
    lightboxTriggerIndex.current = index;
    setActivePhotoIndex(index);
  }

  function moveLightbox(change: number): void {
    setActivePhotoIndex((current) => current === null ? null : getWrappedPhotoIndex(current, change, siteConfig.photos.gallery.length));
  }

  function closeLightbox(): void {
    setActivePhotoIndex(null);
  }

  function updateField<Key extends keyof EntryFormData>(field: Key, value: EntryFormData[Key]): void {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function updateEntryCount(value: string): void {
    updateField("entryCount", value);
  }

  function startOver(): void {
    submissionGuard.current.release();
    setConfirmation(null);
    setSubmitError("");
    window.setTimeout(() => scrollToSection("join"), 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError("");
    if (!launchReady) return;

    if (salesClosed) {
      setSubmitError("Entries are closed for this draw.");
      return;
    }

    const nextErrors = validateEntryForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError("Take a quick look at the highlighted fields.");
      return;
    }

    const trustedLocalCount = parseEntryCount(form.entryCount);
    if (trustedLocalCount === null || !submissionGuard.current.acquire()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(siteConfig.appsScriptEndpoint, {
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
      const serverAmount = typeof payload.amountDue === "number" ? payload.amountDue : amountDue;
      if (serverCount === null || serverAmount !== calculateAmountForEntryCount(serverCount)) {
        throw new Error("We couldn’t confirm the amount. Please try again.");
      }

      setConfirmation({ jarName: form.jarName.trim(), entryCount: serverCount, amountDue: serverAmount });
      setForm({ ...initialForm, entryCount: String(serverCount) });
      setErrors({});
    } catch (error) {
      submissionGuard.current.release();
      setSubmitError(error instanceof Error ? error.message : "We couldn’t save that. Please try again.");
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
            <a href="#entries">Entries</a>
            <a href="#how-it-works">How it works</a>
            <a href="#story">Why we’re doing this</a>
            <a href="#good-to-know">Good to know</a>
          </nav>
          <a className="header-link" href="#join">Get entries <span aria-hidden="true">→</span></a>
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
            <p className="eyebrow eyebrow-light">For friends &amp; family</p>
            <h1 id="hero-title">Ben &amp; Tori’s <em>Wedding 50/50</em></h1>
            <p className="hero-lede">{siteConfig.tagline}</p>
            <div className="hero-actions">
              <button className="button button-gold" type="button" onClick={() => scrollToSection("entries")}>
                Get your name in the jar <span aria-hidden="true">→</span>
              </button>
              <a className="button button-quiet" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">
                Our wedding website <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="hero-details">
              <span><strong>Draw August 15</strong></span>
              <span><strong>$10 each or 3 for $25</strong></span>
              <span><strong>Winner gets half the pot</strong></span>
            </div>
          </div>
        </section>

        <section className="section page-width prize-intro" id="prize" aria-labelledby="prize-title">
          <div className="section-heading section-heading-split">
            <div>
              <p className="eyebrow">The prize</p>
              <h2 id="prize-title">Winner gets half the pot.</h2>
            </div>
            <p>Every paid entry adds to the pot.</p>
          </div>
          <div className="prize-panel">
            <PrizeCounter status={siteConfig.publicPrizeCounterEnabled ? publicStatus : null} />
            <div className="prize-panel-note">
              <span className="note-icon" aria-hidden="true">✓</span>
              <p><strong>One paid entry means one slip in the jar.</strong> Buy four entries and your name goes in four times.</p>
            </div>
          </div>
        </section>

        <section className="section cream-section" id="entries" aria-labelledby="entries-title">
          <div className="page-width">
            <div className="section-heading">
              <p className="eyebrow">Entries</p>
              <h2 id="entries-title">Choose your entries</h2>
            </div>
            <EntryPicker value={form.entryCount} error={errors.entryCount} onChange={updateEntryCount} />
            <div className="ticket-picker-actions">
              <button className="button button-primary" type="button" onClick={() => scrollToSection("join")}>
                Get your name in the jar <span aria-hidden="true">→</span>
              </button>
              {parsedEntryCount !== null ? <span>{entryCount} {entryCount === 1 ? "entry" : "entries"} · {formatCurrency(amountDue)}</span> : null}
            </div>
          </div>
        </section>

        <section className="section page-width" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading section-heading-narrow">
            <h2 id="how-title">How it works</h2>
          </div>
          <ol className="steps-grid">
            <li><span>01</span><h3>Choose your entries</h3><p>Pick how many times you want your name in the jar.</p></li>
            <li><span>02</span><h3>Fill out the form</h3><p>Tell us your name and the name your e-transfer will come from.</p></li>
            <li><span>03</span><h3>Send the e-transfer</h3><p>After you submit, send the amount shown to {siteConfig.eTransferAddress}.</p></li>
            <li><span>04</span><h3>We add your name</h3><p>Once the e-transfer comes through, we’ll add your name to our private draw list once for every entry and print the slips for the jar.</p></li>
          </ol>
          <p className="steps-note">On August 15, we’ll mix all the slips in a jar, draw one on video, and post the winner.</p>
        </section>

        <section className="section entry-section" id="join" aria-labelledby="entry-title">
          <div className="page-width">
            <div className="section-heading section-heading-light">
              <p className="eyebrow eyebrow-light">Join the draw</p>
              <h2 id="entry-title">Get your name in the jar</h2>
              <p>Choose your entries, fill this out, and we’ll show you the e-transfer details.</p>
            </div>

            <div className="entry-layout">
              {confirmation ? (
                <PaymentDetailsCard confirmation={confirmation} onStartOver={startOver} />
              ) : !launchReady || salesClosed ? (
                <PreviewEntryCard salesClosed={salesClosed} backendReadiness={backendReadiness} />
              ) : (
                <form className="form-card" onSubmit={handleSubmit} noValidate>
                  <input type="hidden" name="entryCount" value={form.entryCount} readOnly />
                  <div className="form-card-heading">
                    <h3>Your details</h3>
                    <span className="required-note">* required</span>
                  </div>

                  {submitError ? <p className="form-alert" role="alert">{submitError}</p> : null}

                  <div className="form-grid">
                    <div className="field field-span-2">
                      <label htmlFor="jarName">Name for the jar <span aria-hidden="true">*</span></label>
                      <input id="jarName" name="jarName" type="text" autoComplete="name" value={form.jarName} onChange={(event) => updateField("jarName", event.target.value)} aria-invalid={Boolean(errors.jarName)} aria-describedby={errors.jarName ? "jarName-error" : "jarName-help"} required />
                      <span className="field-help" id="jarName-help">This is the name we’ll write on each of your slips.</span>
                      {errors.jarName ? <span className="field-error" id="jarName-error">{errors.jarName}</span> : null}
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
                      <label htmlFor="eTransferName">Name the e-transfer will come from <span aria-hidden="true">*</span></label>
                      <input id="eTransferName" name="eTransferName" type="text" autoComplete="name" value={form.eTransferName} onChange={(event) => updateField("eTransferName", event.target.value)} aria-invalid={Boolean(errors.eTransferName)} aria-describedby={errors.eTransferName ? "eTransferName-error" : "eTransferName-help"} required />
                      <span className="field-help" id="eTransferName-help">So we know which payment is yours.</span>
                      {errors.eTransferName ? <span className="field-error" id="eTransferName-error">{errors.eTransferName}</span> : null}
                    </div>
                    <div className="field field-span-2">
                      <label htmlFor="message">Message for Ben and Tori <span className="optional">optional</span></label>
                      <textarea id="message" name="message" rows={3} value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="A quick note, if you’d like."></textarea>
                    </div>
                  </div>

                  <div className="selected-ticket-summary">
                    <div><span>Your entries</span><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"} · {formatCurrency(amountDue)}</strong></div>
                    <button className="text-button" type="button" onClick={() => scrollToSection("entries")}>Change entries <span aria-hidden="true">↗</span></button>
                  </div>

                  <div className="honeypot" aria-hidden="true">
                    <label htmlFor="website">Leave this field empty</label>
                    <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(event) => updateField("honeypot", event.target.value)} />
                  </div>

                  <div className="form-submit-row">
                    <div><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"}</strong><span>{formatCurrency(amountDue)} to send</span></div>
                    <button className="button button-primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "One sec…" : "Show e-transfer details"} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}

              {launchReady && !salesClosed && !confirmation ? (
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
                  <p className="payment-note"><span aria-hidden="true">✦</span> Once the payment arrives, we’ll add your name to the jar.</p>
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
            <h2 id="story-title">A fun way to help us out.</h2>
            <p>We thought about doing a full stag and doe, but this felt simpler and gives us more time to plan and get everything ready for the wedding. The 50/50 is a fun way for our friends and family to help with wedding and honeymoon costs, and someone gets to take home half the pot. If you grab an entry or share the page, we really appreciate it.</p>
            <p>Lily is in charge of jar security and moral support.</p>
            <a className="text-button" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">Our wedding details <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="section cream-section" id="draw" aria-labelledby="draw-title">
          <div className="page-width">
            <div className="section-heading section-heading-split">
              <div><p className="eyebrow">The jar draw</p><h2 id="draw-title">Draw details</h2></div>
              <p>We’ll put every paid entry into the jar as a separate name slip, mix them up, and draw one on video.</p>
            </div>
            <div className="draw-grid">
              <div className="draw-card draw-card-featured"><span>Entries close</span><strong>{formatEventDateTime(siteConfig.salesClosingDate)}</strong></div>
              <div className="draw-card"><span>Draw</span><strong>{formatEventDateTime(siteConfig.drawDate)}</strong></div>
              <div className="draw-card"><span>Winner</span><strong>Half the pot</strong></div>
            </div>

            {siteConfig.winnerAnnouncement.announced ? (
              <div className="draw-outcome" aria-live="polite">
                <div><span>Winner</span><strong>{siteConfig.winnerAnnouncement.firstName} {siteConfig.winnerAnnouncement.lastInitial}.</strong></div>
                {siteConfig.winnerAnnouncement.finalPrize !== null ? <div><span>Final prize</span><strong>{formatCurrency(siteConfig.winnerAnnouncement.finalPrize)}</strong></div> : null}
              </div>
            ) : (
              <p className="draw-status">We’ll post the winner and video here afterward.</p>
            )}

            <div className="draw-actions">
              <ShareDrawButton />
              {siteConfig.winnerAnnouncement.drawVideoUrl ? (
                <a className="button button-outline" href={siteConfig.winnerAnnouncement.drawVideoUrl} target="_blank" rel="noreferrer">Watch the draw video <span aria-hidden="true">↗</span></a>
              ) : null}
            </div>
            <ClosingCountdown salesClosed={salesClosed} />
          </div>
        </section>

        <section className="section page-width faq-section" id="good-to-know" aria-labelledby="good-to-know-title">
          <div className="section-heading section-heading-narrow">
            <p className="eyebrow">Quick answers</p>
            <h2 id="good-to-know-title">Good to know</h2>
          </div>
          <div className="good-to-know-grid">
            <article><h3>How much are entries?</h3><p>Entries are $10 each or 3 for $25. Every entry puts your name in the jar once.</p></article>
            <article><h3>How do I pay?</h3><p>Fill out the form first, then send the amount shown by e-transfer to {siteConfig.eTransferAddress}. Use the same first and last name you entered on the form so we can match the payment. Once it comes through, we’ll add your name to the jar once for every entry.</p></article>
            <article><h3>When is my name added?</h3><p>Once we receive your e-transfer, we’ll add your name to the jar once for every entry you bought.</p></article>
            <article><h3>How is the winner picked?</h3><p>We’ll mix all the name slips in a jar and draw one on video on August 15.</p></article>
            <article><h3>How will the winner know?</h3><p>We’ll contact the winner directly and post their first name and last initial here.</p></article>
          </div>
        </section>

        <section className="photo-strip" aria-label="A few favourite photos of Ben, Tori, and Lily">
          <div className="photo-strip-inner">
            {siteConfig.photos.gallery.map((photo, index) => (
              <button
                className="photo-thumb"
                type="button"
                key={photo.src}
                ref={(element) => { photoButtonRefs.current[index] = element; }}
                aria-label={`Open photo ${index + 1} of ${siteConfig.photos.gallery.length}: ${photo.alt}`}
                onClick={() => openLightbox(index)}
              >
                <img src={photo.src} alt="" loading="lazy" />
                <span className="photo-thumb-label" aria-hidden="true">View photo</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {activePhotoIndex !== null ? (
        <div
          className="lightbox-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeLightbox(); }}
        >
          <div
            className="lightbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-position"
            aria-describedby="lightbox-caption"
            ref={lightboxRef}
          >
            <div className="lightbox-toolbar">
              <p id="lightbox-position">Photo {activePhotoIndex + 1} of {siteConfig.photos.gallery.length}</p>
              <button className="lightbox-control lightbox-close" type="button" ref={lightboxCloseRef} aria-label="Close photo viewer" onClick={closeLightbox}>×</button>
            </div>
            <div
              className="lightbox-media"
              onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                if (touchStartX.current === null) return;
                const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(distance) >= 48) moveLightbox(distance > 0 ? -1 : 1);
              }}
            >
              <img src={siteConfig.photos.gallery[activePhotoIndex].src} alt={siteConfig.photos.gallery[activePhotoIndex].alt} />
            </div>
            <div className="lightbox-footer">
              <button className="lightbox-control lightbox-nav" type="button" aria-label="Previous photo" onClick={() => moveLightbox(-1)}>← <span>Previous</span></button>
              <p id="lightbox-caption">{siteConfig.photos.gallery[activePhotoIndex].alt}</p>
              <button className="lightbox-control lightbox-nav" type="button" aria-label="Next photo" onClick={() => moveLightbox(1)}><span>Next</span> →</button>
            </div>
          </div>
        </div>
      ) : null}

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
        <div className="page-width footer-bottom"><span>Thanks for helping us out. — Ben &amp; Tori</span></div>
      </footer>
    </div>
  );
}

export default App;
