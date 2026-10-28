import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { findSection } from "../lib/sections";

// Placeholder for navigation pages that later phases replace with their own route.
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
    <s-page heading={section.title}>
      <s-section>
        <s-stack direction="block" gap="base" alignItems="center">
          <s-heading>Coming soon</s-heading>
          <s-paragraph>{section.description}</s-paragraph>
          <s-text color="subdued">Planned for phase {section.phase}.</s-text>
          <s-button href="/app">Back to dashboard</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
