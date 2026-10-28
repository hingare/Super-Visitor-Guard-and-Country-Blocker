import { describe, expect, it } from "vitest";
import { parseEmbedStatus, themeEditorEmbedUrl } from "../app/lib/theme-embed";

const block = (type: string, disabled?: boolean) => ({
  current: {
    blocks: {
      "123": { type, ...(disabled === undefined ? {} : { disabled }) },
    },
  },
});

const OUR_TYPE = "shopify://apps/visitor-guard-app/blocks/visitor-guard/abc-123";

describe("parseEmbedStatus", () => {
  it("is enabled when our block exists and is not disabled", () => {
    expect(parseEmbedStatus(JSON.stringify(block(OUR_TYPE)))).toBe("enabled");
    expect(parseEmbedStatus(JSON.stringify(block(OUR_TYPE, false)))).toBe(
      "enabled",
    );
  });

  it("is disabled when our block is switched off", () => {
    expect(parseEmbedStatus(JSON.stringify(block(OUR_TYPE, true)))).toBe(
      "disabled",
    );
  });

  it("is disabled when only other apps' blocks exist", () => {
    const other = "shopify://apps/reviews/blocks/stars/xyz";
    expect(parseEmbedStatus(JSON.stringify(block(other)))).toBe("disabled");
    expect(parseEmbedStatus(JSON.stringify({ current: {} }))).toBe("disabled");
  });

  it("ignores the comment Shopify puts at the top of settings_data.json", () => {
    const content = `/*\n * IMPORTANT: auto-generated\n */\n${JSON.stringify(block(OUR_TYPE))}`;
    expect(parseEmbedStatus(content)).toBe("enabled");
  });

  it("is unknown when the file is missing or unreadable", () => {
    expect(parseEmbedStatus(undefined)).toBe("unknown");
    expect(parseEmbedStatus("not json")).toBe("unknown");
  });
});

describe("themeEditorEmbedUrl", () => {
  it("deep links to the app embed in the theme editor", () => {
    expect(themeEditorEmbedUrl("demo.myshopify.com", "key123")).toBe(
      "https://demo.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=key123%2Fvisitor-guard",
    );
  });
});
