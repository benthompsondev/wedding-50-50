import { PhotoGallery } from "./components/PhotoLightbox";
import { siteConfig } from "./config";

function App() {
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
            <a href="#thank-you">Thank you</a>
            <a href="#winning-draw">Winning draw</a>
            <a href="#winner">Winner</a>
            <a href="#story">Wedding details</a>
          </nav>
          <a className="header-link" href="#winner">See the winner <span aria-hidden="true">→</span></a>
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
            <p className="eyebrow eyebrow-light">The draw is complete</p>
            <h1 id="hero-title">Ben &amp; Tori’s <em>Wedding 50/50</em></h1>
            <p className="hero-lede">{siteConfig.tagline}</p>
            <div className="hero-actions">
              <a className="button button-gold" href="#winning-draw">
                Watch the winning draw <span aria-hidden="true">↓</span>
              </a>
              <a className="button button-quiet" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">
                Our wedding website <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="hero-details">
              <span><strong>Draw complete</strong></span>
              <span><strong>$1,100 winner’s prize</strong></span>
              <span><strong>Congratulations, Alanna!</strong></span>
            </div>
          </div>
        </section>

        <section className="section page-width thank-you-section" id="thank-you" aria-labelledby="thank-you-title">
          <div className="thank-you-copy">
            <p className="eyebrow">From both of us</p>
            <h2 id="thank-you-title">Thank You <span aria-hidden="true">❤️</span></h2>
            <p>Thank you so much to everyone who supported our 50/50 draw. It honestly means a lot to both of us, and we really appreciate everyone who bought tickets and helped support us.</p>
            <p>We’re incredibly lucky to have so many great people in our lives, and we can’t wait to celebrate with everyone at the wedding!</p>
            <p>Thank you again for being a part of this with us.</p>
            <p className="thank-you-signoff">Love,<br /><strong>Ben &amp; Tori <span aria-hidden="true">❤️</span></strong></p>
          </div>
        </section>

        <section className="section cream-section winning-draw-section" id="winning-draw" aria-labelledby="winning-draw-title">
          <div className="page-width">
            <div className="section-heading winning-draw-heading">
              <p className="eyebrow">The moment we picked the winner</p>
              <h2 id="winning-draw-title">The Winning Draw <span aria-hidden="true">🎉</span></h2>
            </div>
            <div className="winning-video-wrap">
              <video className="winning-video" controls playsInline preload="metadata" aria-label="Winning draw video">
                <source src={siteConfig.winnerAnnouncement.drawVideoUrl} type="video/mp4" />
                Your browser does not support embedded video.
              </video>
            </div>
          </div>
        </section>

        <section className="section winner-section" id="winner" aria-labelledby="winner-title">
          <div className="page-width winner-inner">
            <p className="eyebrow eyebrow-light">Our winner</p>
            <h2 id="winner-title">Congratulations {siteConfig.winnerAnnouncement.name}! <span aria-hidden="true">🎉</span></h2>
            <p className="winner-prize">Winner of our <strong>$1,100</strong> 50/50 Draw</p>
            <p className="winner-message">Congratulations, Alanna, and thank you again to everyone who participated and supported us!</p>
          </div>
        </section>

        <section className="section page-width story-section" id="story" aria-labelledby="story-title">
          <div className="story-image-wrap">
            <img src={siteConfig.photos.family} alt="Ben and Tori sitting with Lily on the steps" width="1367" height="2048" loading="lazy" />
            <span className="image-stamp">Our little family</span>
          </div>
          <div className="story-copy">
            <p className="eyebrow">Why we did this</p>
            <h2 id="story-title">A fun way you helped us out.</h2>
            <p>We thought about doing a full stag and doe, but the 50/50 felt simpler and gave us more time to get everything ready for the wedding. It was a fun way for our friends and family to help with wedding and honeymoon costs, and it gave us a chance to share half the pot with one lucky winner. We’re so grateful to everyone who joined in.</p>
            <p>Lily was in charge of jar security and moral support.</p>
            <a className="text-button" href={siteConfig.weddingWebsiteUrl} target="_blank" rel="noreferrer">Our wedding details <span aria-hidden="true">↗</span></a>
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
          </div>
        </div>
        <div className="page-width footer-bottom"><span>Thank you for being part of this with us. · Ben &amp; Tori</span></div>
      </footer>
    </div>
  );
}

export default App;
