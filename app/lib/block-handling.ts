// "How would you like the app to handle blocked visitors?" options, shared
// by every storefront blocker.

export type BlockHandling = "CUSTOM_INFO" | "REDIRECT" | "TEMPLATE" | "HIDE_SECTION";

export const HANDLING_OPTIONS: { value: BlockHandling; label: string }[] = [
  { value: "CUSTOM_INFO", label: "Stay on current page and display custom information" },
  { value: "REDIRECT", label: "Redirect to your specified page" },
  { value: "TEMPLATE", label: "Choose a page from our predefined templates" },
  { value: "HIDE_SECTION", label: "Show/Hide Page Section" },
];

export const DEFAULT_HEADER = "Access Denied";
export const DEFAULT_MESSAGE =
  "Sorry, you do not currently have the necessary permissions to access this site, or this site may not be available in your region.";

export const BLOCK_TEMPLATES = [
  { id: "classic", name: "Classic", description: "White page with a lock icon and your message." },
  { id: "dark", name: "Dark", description: "Dark full-screen page with a large heading." },
  { id: "region", name: "Not available in your region", description: "Globe illustration with a regional notice." },
  { id: "maintenance", name: "Maintenance", description: "Tells visitors the store is temporarily unavailable." },
] as const;

export type TemplateId = (typeof BLOCK_TEMPLATES)[number]["id"];

// Only the fields the chosen option uses are returned, so switching options
// keeps what the merchant set up for the others.
export interface HandlingInput {
  handling: BlockHandling;
  header?: string;
  message?: string;
  redirectUrl?: string;
  templateId?: string;
  sectionSelector?: string;
}

export type HandlingResult = { ok: true; value: HandlingInput } | { ok: false; error: string };

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

export function parseHandlingForm(form: FormData): HandlingResult {
  const handling = text(form, "handling") as BlockHandling;
  if (!HANDLING_OPTIONS.some((option) => option.value === handling)) {
    return { ok: false, error: "Choose how blocked visitors are handled." };
  }
  const value: HandlingInput = { handling };

  if (handling === "CUSTOM_INFO" || handling === "TEMPLATE") {
    value.header = text(form, "header").slice(0, 200) || DEFAULT_HEADER;
    value.message = text(form, "message").slice(0, 2000) || DEFAULT_MESSAGE;
  }
  if (handling === "REDIRECT") {
    const url = text(form, "redirectUrl");
    if (!/^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(url)) {
      return { ok: false, error: "Enter a full URL (https://...) or a store path such as /pages/blocked." };
    }
    value.redirectUrl = url;
  }
  if (handling === "TEMPLATE") {
    const templateId = text(form, "templateId");
    if (!BLOCK_TEMPLATES.some((template) => template.id === templateId)) {
      return { ok: false, error: "Choose a template." };
    }
    value.templateId = templateId;
  }
  if (handling === "HIDE_SECTION") {
    const selector = text(form, "sectionSelector");
    if (selector === "" || selector.length > 500 || /[<>{}]/.test(selector)) {
      return { ok: false, error: "Enter a CSS selector, such as #shopify-section-header or .product-form." };
    }
    value.sectionSelector = selector;
  }
  return { ok: true, value };
}
