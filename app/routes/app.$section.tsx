import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { findSection } from "../lib/sections";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Card, EmptyState } from "../components/ui";

// Placeholder for sidebar pages that later phases replace with their own route.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const section = findSection(params.section);
  if (!section) {
    throw new Response("Not found", { status: 404 });
  }
  return { section };
};

export default function SectionPlaceholder() {
  const { section } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader title={section.title} subtitle={section.description} />
      <Card>
        <EmptyState
          title="Coming soon"
          text={`This page is planned for phase ${section.phase}.`}
        />
        <div style={{ textAlign: "center", paddingBottom: 32 }}>
          <Link className={styles.outlineButton} to="/app">
            Back to dashboard
          </Link>
        </div>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
