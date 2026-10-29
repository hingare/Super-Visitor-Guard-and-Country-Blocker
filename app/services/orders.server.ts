import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { APP_NAME } from "../lib/app-info";
import { COD_GATEWAY } from "../lib/order-filters";

// Admin API calls for acting on orders.

export type OrderCallResult = { ok: true } | { ok: false; error: string };

export interface CancelOptions {
  reason: "FRAUD" | "OTHER";
  refund: boolean;
  restock: boolean;
  staffNote: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function cancelOrder(
  admin: AdminApiContext,
  orderId: string,
  options: CancelOptions,
): Promise<OrderCallResult & { jobId?: string }> {
  const response = await admin.graphql(
    `#graphql
    mutation CancelOrder(
      $orderId: ID!
      $reason: OrderCancelReason!
      $refundMethod: OrderCancelRefundMethodInput!
      $restock: Boolean!
      $staffNote: String
    ) {
      orderCancel(
        orderId: $orderId
        reason: $reason
        refundMethod: $refundMethod
        restock: $restock
        notifyCustomer: false
        staffNote: $staffNote
      ) {
        job {
          id
          done
        }
        orderCancelUserErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        orderId,
        reason: options.reason,
        refundMethod: { originalPaymentMethodsRefund: options.refund },
        restock: options.restock,
        staffNote: `${APP_NAME}: ${options.staffNote}`.slice(0, 255),
      },
    },
  );
  const { data } = await response.json();
  const errors: { message: string }[] = data?.orderCancel?.orderCancelUserErrors ?? [];
  if (errors.length > 0) return { ok: false, error: errors[0].message };
  const job = data?.orderCancel?.job;
  return { ok: true, jobId: job && !job.done ? job.id : undefined };
}

// Cancellation runs as a background job; an order can only be deleted once
// it is done.
export async function waitForJob(admin: AdminApiContext, jobId: string, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(1000);
    const response = await admin.graphql(
      `#graphql
      query OrderJob($id: ID!) {
        job(id: $id) {
          done
        }
      }`,
      { variables: { id: jobId } },
    );
    const { data } = await response.json();
    if (data?.job?.done) return true;
  }
  return false;
}

export async function deleteOrder(admin: AdminApiContext, orderId: string): Promise<OrderCallResult> {
  const response = await admin.graphql(
    `#graphql
    mutation DeleteOrder($orderId: ID!) {
      orderDelete(orderId: $orderId) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { orderId } },
  );
  const { data } = await response.json();
  const errors: { message: string }[] = data?.orderDelete?.userErrors ?? [];
  return errors.length > 0 ? { ok: false, error: errors[0].message } : { ok: true };
}

export interface OrderSummary {
  id: string;
  name: string;
  email: string | null;
  cancelled: boolean;
  cashOnDelivery: boolean;
}

export async function getOrderSummary(
  admin: AdminApiContext,
  orderId: string,
): Promise<OrderSummary | null> {
  const response = await admin.graphql(
    `#graphql
    query OrderSummary($id: ID!) {
      order(id: $id) {
        id
        name
        email
        cancelledAt
        paymentGatewayNames
      }
    }`,
    { variables: { id: orderId } },
  );
  const { data } = await response.json();
  const order = data?.order;
  if (!order) return null;
  return {
    id: order.id,
    name: order.name,
    email: order.email ?? null,
    cancelled: Boolean(order.cancelledAt),
    cashOnDelivery: (order.paymentGatewayNames ?? []).some((name: string) => COD_GATEWAY.test(name)),
  };
}
