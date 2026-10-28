// Every page in the app navigation. Pages that are not built yet render a
// placeholder from app.$section.tsx naming the phase that delivers them.

export interface AppSection {
  slug: string;
  title: string;
  description: string;
  phase: number;
}

export const SECTIONS: AppSection[] = [
  {
    slug: "country-blocker",
    title: "Country Blocker",
    description:
      "Block or allow visitors by country, state or city, or redirect them to another page.",
    phase: 2,
  },
  {
    slug: "ip-blocker",
    title: "IP Blocker",
    description:
      "Block single IP addresses or IP ranges, and keep an IP whitelist that is never blocked.",
    phase: 2,
  },
  {
    slug: "bot-blocker",
    title: "Bot & VPN Blocker",
    description:
      "Stop bots, crawlers, VPNs, proxies and data center traffic, and block by ISP, ASN, referrer or URL.",
    phase: 3,
  },
  {
    slug: "checkout-validation",
    title: "Checkout Validation",
    description:
      "Stop checkouts from blacklisted emails, names or phone numbers, and block $0.00 checkouts.",
    phase: 6,
  },
  {
    slug: "fraud-protection",
    title: "Fraud Protection",
    description:
      "Tag, cancel or get notified about orders that match your block rules.",
    phase: 6,
  },
  {
    slug: "content-protection",
    title: "Content Protection",
    description:
      "Disable right-click, keyboard shortcuts, dragging, text selection and image copying.",
    phase: 5,
  },
  {
    slug: "redirects",
    title: "Redirects",
    description: "Send visitors from chosen countries or IPs to another URL.",
    phase: 2,
  },
  {
    slug: "blocked-page",
    title: "Blocked Page",
    description:
      "Customize the page blocked visitors see: title, message, colors and logo.",
    phase: 2,
  },
  {
    slug: "visit-log",
    title: "Visit Log",
    description:
      "See every visit with IP, location, ISP, device and whether it was blocked, and why.",
    phase: 4,
  },
  {
    slug: "plans",
    title: "Plans",
    description: "Pay as you go or Premium, and your usage this billing cycle.",
    phase: 7,
  },
];

export function findSection(slug: string | undefined): AppSection | undefined {
  return SECTIONS.find((section) => section.slug === slug);
}
