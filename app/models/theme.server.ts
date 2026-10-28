import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { parseEmbedStatus, type EmbedStatus } from "../lib/theme-embed";

const MAIN_THEME_SETTINGS_QUERY = `#graphql
  query MainThemeSettings {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"], first: 1) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }`;

// Whether the storefront app embed is on in the live theme.
export async function getEmbedStatus(
  admin: AdminApiContext,
): Promise<{ status: EmbedStatus; themeName: string | null }> {
  try {
    const response = await admin.graphql(MAIN_THEME_SETTINGS_QUERY);
    const json = await response.json();
    const theme = json.data?.themes?.nodes?.[0];
    const body = theme?.files?.nodes?.[0]?.body as
      | { content?: string }
      | undefined;
    return {
      status: parseEmbedStatus(body?.content),
      themeName: theme?.name ?? null,
    };
  } catch (error) {
    console.error("Could not read theme settings", error);
    return { status: "unknown", themeName: null };
  }
}
