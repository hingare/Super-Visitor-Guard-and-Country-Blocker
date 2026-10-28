import type { ComponentProps } from "react";

export type IconName = NonNullable<ComponentProps<"s-icon">["type"]>;

// Every page in the app's sidebar, grouped like the reference app.
// Pages that are not built yet render a placeholder from app.$section.tsx
// naming the phase that delivers them.

export interface AppSection {
  slug: string;
  title: string;
  description: string;
  icon: IconName;
  phase: number;
}

export interface SectionGroup {
  heading?: string;
  sections: AppSection[];
}

export const DASHBOARD: AppSection = {
  slug: "",
  title: "Dashboard",
  description: "",
  icon: "store",
  phase: 1,
};

export const SECTION_GROUPS: SectionGroup[] = [
  {
    sections: [
      DASHBOARD,
      {
        slug: "visitor-logs",
        title: "Shop Visitor Logs",
        description:
          "See who visits your store, where they come from, and act on suspicious visitors.",
        icon: "search-list",
        phase: 4,
      },
      {
        slug: "settings",
        title: "General Settings",
        description: "",
        icon: "settings",
        phase: 1,
      },
      {
        slug: "extension",
        title: "App extension",
        description: "Activate the app in the theme editor.",
        icon: "app-extension",
        phase: 1,
      },
      {
        slug: "page-whitelists",
        title: "Page White Lists",
        description:
          "Pages on these lists are never filtered, whatever your other rules say.",
        icon: "globe",
        phase: 2,
      },
    ],
  },
  {
    heading: "Storefront Blockers",
    sections: [
      {
        slug: "country-blocker",
        title: "Country Blocker",
        description:
          "Keep visitors from chosen countries or regions out of your store.",
        icon: "globe-lines",
        phase: 2,
      },
      {
        slug: "ip-blocker",
        title: "IP Blocker",
        description: "Block individual visitors by IP address or IP range.",
        icon: "code",
        phase: 2,
      },
      {
        slug: "bot-blocker",
        title: "Bot(VPN/Proxy) Blocker",
        description:
          "Stop bots and visitors hiding behind VPN, Tor or proxy connections.",
        icon: "search",
        phase: 3,
      },
      {
        slug: "customer-block-lists",
        title: "Customer Block Lists",
        description:
          "Stop checkouts from customers who match your block rules.",
        icon: "clipboard-checklist",
        phase: 6,
      },
      {
        slug: "block-lists",
        title: "Block Lists(Legacy)",
        description:
          "Keep identified visitors and customers out of your store.",
        icon: "disabled",
        phase: 3,
      },
      {
        slug: "referrer-blocker",
        title: "Referrer Blocker",
        description: "Block visits that arrive from chosen referring sites.",
        icon: "link",
        phase: 3,
      },
      {
        slug: "isp-asn-blocker",
        title: "ISP/ASN Blocker",
        description:
          "Block traffic from chosen internet providers (ISP) or networks (ASN).",
        icon: "database",
        phase: 3,
      },
      {
        slug: "url-blocker",
        title: "URL Blocker",
        description:
          "Block visits whose page URL matches text you choose, such as a tracking parameter.",
        icon: "link-list",
        phase: 3,
      },
    ],
  },
  {
    heading: "Order Filters",
    sections: [
      {
        slug: "fraud-protect",
        title: "Fraud Protect",
        description: "Handle orders Shopify marks as risky automatically.",
        icon: "shield-check-mark",
        phase: 6,
      },
      {
        slug: "auto-cancel-filters",
        title: "Auto-cancel filters",
        description:
          "Cancel orders from buyers on your cancel list automatically.",
        icon: "file-list",
        phase: 6,
      },
    ],
  },
  {
    heading: "Other Tools",
    sections: [
      {
        slug: "content-protection",
        title: "Content Protection",
        description:
          "Disable right-click, keyboard shortcuts, dragging, text selection and image copying on your storefront.",
        icon: "lock",
        phase: 5,
      },
      {
        slug: "geolocation-redirects",
        title: "Geolocation Redirects",
        description:
          "Send visitors to the right local store based on where they are.",
        icon: "domain-redirect",
        phase: 5,
      },
      {
        slug: "ip-lookup",
        title: "IP Address Lookup",
        description: "Look up location, provider and risk details for any IP address.",
        icon: "target",
        phase: 4,
      },
    ],
  },
  {
    sections: [
      {
        slug: "contact",
        title: "Contact Us",
        description: "Get help from our support team.",
        icon: "email",
        phase: 8,
      },
      {
        slug: "faq",
        title: "FAQ",
        description: "Answers to common questions.",
        icon: "question-circle",
        phase: 8,
      },
    ],
  },
];

export const ALL_SECTIONS: AppSection[] = SECTION_GROUPS.flatMap(
  (group) => group.sections,
);

export function sectionHref(section: AppSection): string {
  return section.slug ? `/app/${section.slug}` : "/app";
}

export function findSection(slug: string | undefined): AppSection | undefined {
  if (!slug) return undefined;
  return ALL_SECTIONS.find((section) => section.slug === slug);
}
