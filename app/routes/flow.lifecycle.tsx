import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { recordFlowLifecycle, type LifecyclePayload } from "../services/flow.server";

// Shopify Flow trigger lifecycle callbacks: a store turned on or off a
// workflow that uses one of the app's triggers. Flow signs the request with
// the app secret, which authenticate.flow checks. Flow waits at most five
// seconds for the answer.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload } = await authenticate.flow(request);
  await recordFlowLifecycle(payload as LifecyclePayload);
  return new Response(null, { status: 200 });
};
