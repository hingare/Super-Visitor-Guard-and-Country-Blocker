// Reading the customers/data_request and customers/redact webhook payloads.
// See https://shopify.dev/docs/apps/build/privacy-law-compliance

export interface CompliancePayload {
  customer?: { id?: number | string | null; email?: string | null; phone?: string | null } | null;
  orders_to_redact?: (number | string)[] | null;
  orders_requested?: (number | string)[] | null;
  data_request?: { id?: number | string | null } | null;
}

export interface CustomerSubject {
  // Order ids in the form the order log stores them.
  orderIds: string[];
  email: string | null;
  requestId: string | null;
}

export function customerSubject(payload: CompliancePayload): CustomerSubject {
  const orders = [...(payload.orders_to_redact ?? []), ...(payload.orders_requested ?? [])];
  const email = payload.customer?.email?.trim().toLowerCase() || null;
  const requestId = payload.data_request?.id;
  return {
    orderIds: [
      ...new Set(
        orders
          .map((id) => String(id).trim())
          .filter((id) => /^\d+$/.test(id))
          .map((id) => `gid://shopify/Order/${id}`),
      ),
    ],
    email,
    requestId: requestId == null ? null : String(requestId),
  };
}

export interface HeldOrderRecord {
  orderName: string | null;
  email: string | null;
  reason: string;
  actionTaken: string;
  createdAt: Date;
}

// The plain-text summary sent to the merchant for a customer data request.
export function formatDataRequest(
  appName: string,
  shopDomain: string,
  subject: CustomerSubject,
  records: HeldOrderRecord[],
): string {
  const lines = [
    `A customer of ${shopDomain} asked for the data held about them${subject.requestId ? ` (Shopify data request ${subject.requestId})` : ""}.`,
    "",
    `${appName} keeps a log of the orders it acted on. It holds ${records.length} log ${records.length === 1 ? "entry" : "entries"} for this customer${subject.email ? ` (${subject.email})` : ""}:`,
    "",
  ];
  if (records.length === 0) lines.push("  (none)");
  for (const record of records) {
    lines.push(
      `  ${record.createdAt.toISOString().slice(0, 10)}  ${record.orderName ?? "order"}  ${record.email ?? "-"}  ${record.actionTaken.toLowerCase()}: ${record.reason}`,
    );
  }
  lines.push(
    "",
    "Visitor logs are stored by IP address and visitor id and are not linked to customer accounts.",
    "Please pass this on to the customer as part of your reply to their request.",
  );
  return lines.join("\n");
}
