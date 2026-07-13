export const siteConfig = {
  title: "Ben & Tori’s Wedding 50/50",
  tagline:
    "We decided to skip the stag and doe and do one 50/50 instead. Pick how many entries you want, and once your e-transfer comes through, we’ll put your name in the jar once for each one. The winner gets half the pot, and the other half helps us with the wedding.",
  weddingDate: "October 10, 2026",
  location: "Cambridge, Ontario",
  eTransferAddress: "torigabriellerivard@hotmail.com",
  weddingWebsiteUrl: "https://withjoy.com/tori-rivard-and-ben",

  salesClosingDate: "2026-08-15T18:00:00-04:00",
  drawDate: "2026-08-15T20:00:00-04:00",
  publicWebsiteUrl: "https://benthompsondev.github.io/wedding-50-50/",
  appsScriptEndpoint: "",
  publicPrizeCounterEnabled: true,

  winnerAnnouncement: {
    announced: false,
    firstName: "",
    lastInitial: "",
    finalPrize: null as number | null,
    drawVideoUrl: "",
  },

  photos: {
    hero: "./images/hero-pumpkin.jpg",
    socialPreview: "./images/social-preview.jpg",
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
        alt: "Ben and Tori giving Lily a kiss",
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
