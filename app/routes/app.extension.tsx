import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getEmbedStatus } from "../models/theme.server";
import { themeEditorEmbedUrl } from "../lib/theme-embed";
import { APP_NAME } from "../lib/app-info";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection } from "../components/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const embed = await getEmbedStatus(admin);

  return {
    embedStatus: embed.status,
    themeName: embed.themeName,
    // eslint-disable-next-line no-undef
    embedUrl: themeEditorEmbedUrl(session.shop, process.env.SHOPIFY_API_KEY || ""),
  };
};

export default function ExtensionPage() {
  const { embedStatus, themeName, embedUrl } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <>
      <PageHeader title={`Activate ${APP_NAME} app in Theme Editor`} />

      <Banner>
        <p>
          <strong>Why the theme embed matters</strong>
        </p>
        <p>
          Blocking visitors, recording visits and protecting your content all
          happen on your storefront, through a small app embed in your theme.
          Until it is switched on, those features cannot run.
        </p>
      </Banner>

      <Card>
        <CardSection>
          <div className={styles.toggleRow}>
            <s-icon
              type={embedStatus === "enabled" ? "check-circle-filled" : "x-circle"}
              tone={embedStatus === "enabled" ? "success" : "critical"}
            />
            <span>
              {embedStatus === "enabled"
                ? `The app embed is on${themeName ? ` in ${themeName}` : ""}.`
                : embedStatus === "disabled"
                  ? `The app embed is off${themeName ? ` in ${themeName}` : ""}.`
                  : "We could not check the app embed right now."}
            </span>
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => revalidator.revalidate()}
            >
              <s-icon type="refresh" /> Check again
            </button>
          </div>
        </CardSection>
        <CardSection>
          <h2 className={styles.cardTitle}>
            Use the button below to switch the app on automatically.
          </h2>
          <p className={styles.redNote}>
            After the theme editor opens, click &quot;Save&quot; in the top right
            corner to keep the change.
          </p>
          <a
            className={styles.primaryButton}
            href={embedUrl}
            target="_top"
            rel="noreferrer"
          >
            Auto enable {APP_NAME} app
          </a>
        </CardSection>
      </Card>

      <Card>
        <CardSection title={`Enable ${APP_NAME} app manually:`}>
          <div className={styles.steps}>
            <h3>
              Step 1: In Shopify admin, go to Online Store &gt; Themes and click
              Customize on your live theme.
            </h3>
            <h3>
              Step 2: Open App embeds in the left menu, switch on &quot;Visitor
              guard&quot;, then click Save in the top right.
            </h3>
          </div>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
