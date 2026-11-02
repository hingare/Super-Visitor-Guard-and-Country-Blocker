import type { ComponentProps } from "react";

export type IconName = NonNullable<ComponentProps<"s-icon">["type"]>;

// Every page in the app's sidebar, grouped like the reference app.

export interface AppSection {
  slug: string;
  title: string;
  description: string;
  icon: IconName;
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
      },
      {
        slug: "settings",
        title: "General Settings",
        description: "",
        icon: "settings",
      },
      {
        slug: "extension",
        title: "App extension",
        description: "Activate the app in the theme editor.",
        icon: "app-extension",
      },
      {
        slug: "page-whitelists",
        title: "Page White Lists",
        description:
          "Pages on these lists are never filtered, whatever your other rules say.",
        icon: "globe",
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
      },
      {
        slug: "ip-blocker",
        title: "IP Blocker",
        description: "Block individual visitors by IP address or IP range.",
        icon: "code",
      },
      {
        slug: "bot-blocker",
        title: "Bot(VPN/Proxy) Blocker",
        description:
          "Stop bots and visitors hiding behind VPN, Tor or proxy connections.",
        icon: "search",
      },
      {
        slug: "customer-block-lists",
        title: "Customer Block Lists",
        description:
          "Stop checkouts from customers who match your block rules.",
        icon: "clipboard-checklist",
      },
      {
        slug: "block-lists",
        title: "Block Lists(Legacy)",
        description:
          "Keep identified visitors and customers out of your store.",
        icon: "disabled",
      },
      {
        slug: "referrer-blocker",
        title: "Referrer Blocker",
        description: "Block visits that arrive from chosen referring sites.",
        icon: "link",
      },
      {
        slug: "isp-asn-blocker",
        title: "ISP/ASN Blocker",
        description:
          "Block traffic from chosen internet providers (ISP) or networks (ASN).",
        icon: "database",
      },
      {
        slug: "url-blocker",
        title: "URL Blocker",
        description:
          "Block visits whose page URL matches text you choose, such as a tracking parameter.",
        icon: "link-list",
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
      },
      {
        slug: "auto-cancel-filters",
        title: "Auto-cancel filters",
        description:
          "Cancel orders from buyers on your cancel list automatically.",
        icon: "file-list",
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
      },
      {
        slug: "geolocation-redirects",
        title: "Geolocation Redirects",
        description:
          "Send visitors to the right local store based on where they are.",
        icon: "domain-redirect",
      },
      {
        slug: "ip-lookup",
        title: "IP Address Lookup",
        description: "Look up location, provider and risk details for any IP address.",
        icon: "target",
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
      },
      {
        slug: "faq",
        title: "FAQ",
        description: "Answers to common questions.",
        icon: "question-circle",
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
