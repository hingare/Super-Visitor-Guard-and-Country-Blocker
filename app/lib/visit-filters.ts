// URL parameters of the Shop Visitor Logs page.

export interface VisitFilters {
  by: "ip" | "country";
  q: string;
  blockedOnly: boolean;
  botsOnly: boolean;
  // "Hide Low-risk Bots" is on unless the URL turns it off.
  hideLowRiskBots: boolean;
  page: number;
}

export function readVisitFilters(params: URLSearchParams): VisitFilters {
  return {
    by: params.get("by") === "country" ? "country" : "ip",
    q: (params.get("q") ?? "").trim().slice(0, 100),
    blockedOnly: params.get("blocked") === "1",
    botsOnly: params.get("bots") === "1",
    hideLowRiskBots: params.get("lowrisk") !== "1",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

export const PAGE_TYPE_LABELS: Record<string, string> = {
  index: "Home",
  product: "Product",
  collection: "Collection",
  "list-collections": "Collections",
  cart: "Cart",
  search: "Search",
  page: "Page",
  blog: "Blog",
  article: "Article",
  customers: "Account",
  "customers/account": "Account",
  "customers/login": "Login",
  "customers/register": "Register",
  "customers/order": "Order",
  "404": "Not found",
  password: "Password",
};

export function pageTypeLabel(pageType: string | null): string {
  if (!pageType) return "Page";
  return PAGE_TYPE_LABELS[pageType] ?? pageType.charAt(0).toUpperCase() + pageType.slice(1);
}
