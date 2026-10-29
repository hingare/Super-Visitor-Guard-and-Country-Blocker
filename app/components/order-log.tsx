import { frameStyles as styles } from "./AppFrame";
import { EmptyState } from "./ui";
import { Pagination } from "./blockers";

export interface OrderLogRow {
  id: string;
  orderId: string;
  orderName: string | null;
  email: string | null;
  riskLevel: string | null;
  actionTaken: string;
  reason: string;
  updatedAt: string | Date;
}

const RISK_TONES: Record<string, "critical" | "warning" | "success" | "neutral"> = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "success",
  NONE: "success",
};

const ACTION_LABELS: Record<string, string> = {
  CANCELLED: "Cancelled",
  DELETED: "Cancelled and deleted",
  SKIPPED: "No action",
  FAILED: "Failed",
};

function orderAdminUrl(orderId: string) {
  return `shopify:admin/orders/${orderId.split("/").pop()}`;
}

// Orders an order filter acted on (or checked), with pagination ("o" prefix).
export function OrderLogTable({
  data,
  showRisk = false,
  emptyText,
}: {
  data: { flags: OrderLogRow[]; total: number; page: number; pageCount: number };
  showRisk?: boolean;
  emptyText: string;
}) {
  if (data.total === 0) return <EmptyState title="No filtered order found" text={emptyText} />;
  return (
    <>
      <table className={styles.table} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Order</th>
            <th>Email</th>
            {showRisk && <th>Risk</th>}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.flags.map((flag) => (
            <tr key={flag.id}>
              <td>{new Date(flag.updatedAt).toLocaleString()}</td>
              <td>
                {flag.actionTaken === "DELETED" ? (
                  (flag.orderName ?? flag.orderId)
                ) : (
                  <a href={orderAdminUrl(flag.orderId)}>{flag.orderName ?? flag.orderId}</a>
                )}
              </td>
              <td>{flag.email ?? "-"}</td>
              {showRisk && (
                <td>
                  <s-badge tone={RISK_TONES[flag.riskLevel ?? ""] ?? "neutral"}>
                    {(flag.riskLevel ?? "unknown").toLowerCase()}
                  </s-badge>
                </td>
              )}
              <td>
                {ACTION_LABELS[flag.actionTaken] ?? flag.actionTaken}
                <div className={styles.muted}>{flag.reason}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination total={data.total} page={data.page} pageCount={data.pageCount} prefix="o" />
    </>
  );
}
