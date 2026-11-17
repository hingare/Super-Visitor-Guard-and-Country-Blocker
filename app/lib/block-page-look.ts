// "Block page look": the store's logo and brand color on the pages visitors
// see (block page, browser check page, geolocation offer).

export interface BlockPageLook {
  useBrand: boolean;
  // Overrides; when empty the storefront uses the brand set in Shopify.
  logoUrl: string | null;
  color: string | null;
}

export function pickBlockPageLook(settings: {
  blockPageBranding: boolean;
  blockPageLogoUrl: string | null;
  blockPageColor: string | null;
}): BlockPageLook {
  return {
    useBrand: settings.blockPageBranding,
    logoUrl: settings.blockPageLogoUrl,
    color: settings.blockPageColor,
  };
}

export type BlockPageLookResult =
  | { ok: true; value: { blockPageBranding: boolean; blockPageLogoUrl: string | null; blockPageColor: string | null } }
  | { ok: false; error: string };

const COLOR = /^#[0-9a-f]{6}$/i;

export function parseBlockPageLook(form: FormData): BlockPageLookResult {
  const useBrand = form.get("useBrand") === "on";
  const logo = String(form.get("logoUrl") ?? "").trim();
  const color = String(form.get("color") ?? "").trim();
  if (logo) {
    let url: URL | null = null;
    try {
      url = new URL(logo);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:" || logo.length > 500) {
      return { ok: false, error: "Enter the logo's full address, starting with https://." };
    }
  }
  if (color && !COLOR.test(color)) {
    return { ok: false, error: "Enter the color as a hex code, such as #1a73e8." };
  }
  return {
    ok: true,
    value: {
      blockPageBranding: useBrand,
      blockPageLogoUrl: logo || null,
      blockPageColor: color ? color.toLowerCase() : null,
    },
  };
}

// What the storefront script gets: only set when branding is on.
export function storefrontBrand(look: BlockPageLook) {
  if (!look.useBrand) return undefined;
  return { logo: look.logoUrl ?? undefined, color: look.color ?? undefined };
}
