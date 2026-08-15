export const siteConfig = {
  title: "Ben & Tori’s Wedding 50/50",
  tagline:
    "Our draw is complete. Thank you to everyone who joined in and helped support our wedding and honeymoon. We’re so grateful, and we’re excited to share the winning draw with you.",
  weddingDate: "October 10, 2026",
  location: "Cambridge, Ontario",
  eTransferAddress: "torigabriellerivard@hotmail.com",
  weddingWebsiteUrl: "https://withjoy.com/tori-rivard-and-ben",

  salesClosingDate: "2026-08-15T18:00:00-04:00",
  drawDate: "2026-08-15T20:00:00-04:00",
  publicWebsiteUrl: "https://benthompsondev.github.io/wedding-50-50/",
  appsScriptEndpoint: "https://script.google.com/macros/s/AKfycbwlbtpUP7e4_3JVZ_xZ6v2HhdentgdY3ZT4jf3V5KE4FlrW4JDijxJDPRGBLn5dpXUkjw/exec",
  publicPrizeCounterEnabled: true,

  winnerAnnouncement: {
    announced: true,
    name: "Alanna Thompson",
    finalPrize: 1100,
    drawVideoUrl: "./videos/winning-draw.mp4",
  },

  photos: {
    hero: "./images/hero-pumpkin.jpg",
    socialPreview: "./images/hero-pumpkin.jpg",
    family: "./images/family-lily.jpg",
    gallery: [
      {
        src: "./images/park-portrait.jpg",
        alt: "Ben and Tori sitting with Lily in a tree-lined park",
      },
      {
        src: "./images/park-standing.jpg",
        alt: "Ben, Tori, and Lily standing together outside",
      },
      {
        src: "./images/sunset-embrace.jpg",
        alt: "Ben and Tori smiling together in warm evening light",
      },
      {
        src: "./images/kiss-with-lily.jpg",
        alt: "Ben and Tori sharing a quiet moment in the golden sunset light",
      },
      {
        src: "./images/pumpkin-date.jpg",
        alt: "Ben and Tori beside their October wedding pumpkin",
      },
      {
        src: "./images/garden-kiss.jpg",
        alt: "Ben and Tori giving Lily a kiss on the steps",
      },
    ],
  },
} as const;
