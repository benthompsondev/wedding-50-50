import { useRef, useState, type FormEvent } from "react";
import { ClosingCountdown } from "./components/ClosingCountdown";
import { EntryForm, PaymentSummaryCard, PreviewEntryCard } from "./components/EntryForm";
import { EntryPicker } from "./components/EntryPicker";
import { PaymentDetailsCard, type Confirmation } from "./components/PaymentDetailsCard";
import { PhotoGallery } from "./components/PhotoLightbox";
import { PrizeCounter } from "./components/PrizeCounter";
import { ShareDrawButton } from "./components/ShareButtons";
import { siteConfig } from "./config";
import { usePublicStatus } from "./hooks/usePublicStatus";
import {
  calculateAmountForEntryCount,
  createSubmissionGuard,
  formatCurrency,
  isSalesClosed,
  parseEntryCount,
  validateEntryForm,
  type EntryFormData,
  type EntryFormErrors,
} from "./lib/lottery";
import { formatEventDateTime, scrollToSection } from "./lib/display";
import { submitEntry } from "./services/weddingDrawApi";

const initialForm: EntryFormData = {
  jarName: "",
  email: "",
  phone: "",
  entryCount: "3",
  eTransferName: "",
  message: "",
  honeypot: "",
};

function App() {
  const [form, setForm] = useState<EntryFormData>(initialForm);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const submissionGuard = useRef(createSubmissionGuard());
  const { backendReadiness, launchReady, publicStatus, refreshAfterSubmission } = usePublicStatus({
    closingDate: siteConfig.salesClosingDate,
    drawDate: siteConfig.drawDate,
    endpoint: siteConfig.appsScriptEndpoint,
  });
  const salesClosed = isSalesClosed(siteConfig.salesClosingDate);
  const parsedEntryCount = parseEntryCount(form.entryCount);
  const entryCount = parsedEntryCount ?? 1;
  const amountDue = calculateAmountForEntryCount(entryCount);

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
      const trusted = await submitEntry(
        siteConfig.appsScriptEndpoint,
        form,
        trustedLocalCount,
        amountDue,
      );
      setConfirmation({
        jarName: form.jarName.trim(),
        entryCount: trusted.entryCount,
        amountDue: trusted.amountDue,
      });
      setForm({ ...initialForm, entryCount: String(trusted.entryCount) });
      setErrors({});
      refreshAfterSubmission();
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
            <p>Every submitted entry adds to the running total. We’ll reconcile the e-transfers before the draw.</p>
          </div>
          <div className="prize-panel">
            <PrizeCounter status={siteConfig.publicPrizeCounterEnabled ? publicStatus : null} />
            <div className="prize-panel-note">
              <span className="note-icon" aria-hidden="true">✓</span>
              <p><strong>One entry means one slip in the jar.</strong> Buy four entries and your name goes in four times.</p>
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
            <li><span>04</span><h3>We record your entries</h3><p>Once you submit, we’ll add your name to our private draw list once for every entry. We’ll reconcile the e-transfers before the draw.</p></li>
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
                <EntryForm
                  amountDue={amountDue}
                  entryCount={entryCount}
                  errors={errors}
                  form={form}
                  isSubmitting={isSubmitting}
                  submitError={submitError}
                  onFieldChange={updateField}
                  onSubmit={handleSubmit}
                />
              )}

              {launchReady && !salesClosed && !confirmation ? (
                <PaymentSummaryCard amountDue={amountDue} entryCount={entryCount} />
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
            <p>We thought about doing a full stag and doe, but this felt simpler and gives us more time to plan and get everything ready for the wedding. The 50/50 is a fun way for our friends and family to help us with wedding and honeymoon costs — and someone gets to take home half the pot. If you grab an entry or share the page, we really appreciate it.</p>
            <p>Lily is in charge of jar security and moral support.</p>
            <a className="text-button" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">Our wedding details <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="section cream-section" id="draw" aria-labelledby="draw-title">
          <div className="page-width">
            <div className="section-heading section-heading-split">
              <div><p className="eyebrow">The jar draw</p><h2 id="draw-title">Draw details</h2></div>
              <p>We’ll put every included entry into the jar as a separate name slip, mix them up, and draw one on video.</p>
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
            <article><h3>How do I pay?</h3><p>Fill out the form first, then send the amount shown by e-transfer to {siteConfig.eTransferAddress}. Use the same first and last name you entered on the form so we can match the payment. Once you submit, we’ll record your entries and check the e-transfer before the draw.</p></article>
            <article><h3>When is my name added?</h3><p>As soon as you submit the form, we’ll record one entry for every name slip you selected. We’ll check the e-transfer before the draw.</p></article>
            <article><h3>How is the winner picked?</h3><p>We’ll mix all the name slips in a jar and draw one on video on August 15.</p></article>
            <article><h3>How will the winner know?</h3><p>We’ll contact the winner directly and post their first name and last initial here.</p></article>
          </div>
        </section>

        <PhotoGallery photos={siteConfig.photos.gallery} />
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
        <div className="page-width footer-bottom"><span>Thanks for helping us out. — Ben &amp; Tori</span></div>
      </footer>
    </div>
  );
}

export default App;
