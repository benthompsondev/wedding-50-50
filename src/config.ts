export type TicketPackageConfig = {
  id: "single" | "triple";
  label: string;
  tickets: number;
  amount: number;
  priceLabel: string;
  detail: string;
};

export const ticketPackages: readonly TicketPackageConfig[] = [
  {
    id: "single",
    label: "1 Ticket",
    tickets: 1,
    amount: 10,
    priceLabel: "$10",
    detail: "A simple chance to win.",
  },
  {
    id: "triple",
    label: "3 Tickets",
    tickets: 3,
    amount: 25,
    priceLabel: "$25",
    detail: "Three chances for a little extra fun.",
  },
];

export const siteConfig = {
  title: "Ben & Tori’s Wedding 50/50",
  tagline: "Win half the pot and help us celebrate our next chapter.",
  weddingDate: "October 10, 2026",
  weddingDateIso: "2026-10-10",
  location: "Cambridge, Ontario",
  eTransferAddress: "torigabriellerivard@hotmail.com",
  weddingWebsiteUrl: "https://withjoy.com/tori-rivard-and-ben",

  // Replace these before launch. Leave them as TODO values until the dates are final.
  salesClosingDate: "TODO_DRAW_CLOSING_DATE",
  drawDate: "TODO_DRAW_DATE",
  publicWebsiteUrl: "https://benthompsondev.github.io/wedding-50-50/",
  appsScriptEndpoint: "",
  publicPrizeCounterEnabled: true,

  prizeFallbackText: "The final prize will be 50% of all confirmed ticket sales.",
  winnerAnnouncement: {
    announced: false,
    firstName: "",
    lastInitial: "",
    winningTicketNumber: "",
    finalPrize: null as number | null,
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
        src: "./images/first-dance.webp",
        alt: "Ben and Tori sharing a quiet moment together",
      },
      {
        src: "./images/garden-kiss.jpg",
        alt: "Ben and Tori kissing Lily between them",
      },
    ],
  },
} as const;
