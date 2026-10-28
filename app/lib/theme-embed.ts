// Detects whether the storefront app embed is switched on in the live theme,
// by reading the theme's config/settings_data.json.

export const APP_EMBED_HANDLE = "visitor-guard";

export type EmbedStatus = "enabled" | "disabled" | "unknown";

interface ThemeBlock {
  type?: string;
  disabled?: boolean;
}

// settings_data.json often starts with a /* ... */ comment that JSON.parse rejects.
function stripLeadingComment(content: string): string {
  return content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
}

export function parseEmbedStatus(
  settingsDataJson: string | null | undefined,
  blockHandle: string = APP_EMBED_HANDLE,
): EmbedStatus {
  if (!settingsDataJson) return "unknown";

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripLeadingComment(settingsDataJson));
  } catch {
    return "unknown";
  }

  const blocks = (parsed as { current?: { blocks?: Record<string, ThemeBlock> } })
    ?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return "disabled";

  // App embed block types look like shopify://apps/<app>/blocks/<handle>/<uuid>
  const marker = `/blocks/${blockHandle}/`;
  const ours = Object.values(blocks).find(
    (block) => typeof block?.type === "string" && block.type.includes(marker),
  );

  if (!ours) return "disabled";
  return ours.disabled === true ? "disabled" : "enabled";
}

export function themeEditorEmbedUrl(
  shopDomain: string,
  apiKey: string,
  blockHandle: string = APP_EMBED_HANDLE,
): string {
  const params = new URLSearchParams({
    context: "apps",
    activateAppId: `${apiKey}/${blockHandle}`,
  });
  return `https://${shopDomain}/admin/themes/current/editor?${params.toString()}`;
}
