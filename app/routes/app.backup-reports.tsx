import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { invalidateVerdictConfig } from "../models/rules.server";
import { syncCheckoutValidation } from "../models/checkout-validation.server";
import { mailConfigured } from "../services/mailer.server";
import { sendReport } from "../services/weekly-report.server";
import { BACKUP_MAX_ROWS, parseBackupCsv } from "../lib/rule-backup";
import { downloadFile } from "../lib/download";
import { isChecked } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, StatusToggle } from "../components/ui";
import { useResultToast } from "../components/blockers";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);

  let suggestedEmail = shop.settings.reportEmail ?? shop.settings.notifyEmail ?? "";
  if (!suggestedEmail) {
    try {
      const response = await admin.graphql(`#graphql
        query ReportShopEmail {
          shop {
            email
          }
        }`);
      const { data } = await response.json();
      suggestedEmail = data?.shop?.email ?? "";
    } catch (error) {
      console.error("Could not load the shop email", error);
    }
  }

  const ruleCount = await db.rule.count({ where: { shopId: shop.id } });
  return {
    ruleCount,
    weeklyReportEnabled: shop.settings.weeklyReportEnabled,
    reportEmail: suggestedEmail,
    lastReportAt: shop.settings.lastReportAt,
    canSend: mailConfigured(),
  };
};

type ActionResult =
  | { ok: true; message: string; details?: string[] }
  | { ok: false; error: string; details?: string[] };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "report": {
      const weeklyReportEnabled = isChecked(form.get("enabled"));
      const reportEmail = String(form.get("email") ?? "").trim().slice(0, 200);
      if (weeklyReportEnabled && !EMAIL.test(reportEmail)) {
        return { ok: false, error: "Enter the email address the summary should go to." };
      }
      await db.settings.update({
        where: { shopId: shop.id },
        data: { weeklyReportEnabled, ...(reportEmail ? { reportEmail } : {}) },
      });
      return {
        ok: true,
        message: weeklyReportEnabled ? "Weekly summary turned on" : "Weekly summary turned off",
      };
    }
    case "sendNow": {
      const to = String(form.get("email") ?? "").trim();
      if (!EMAIL.test(to)) return { ok: false, error: "Enter the email address the summary should go to." };
      if (!mailConfigured()) return { ok: false, error: "Email sending is not set up on this app yet." };
      try {
        await sendReport(shop.id, shop.shopDomain, to);
        return { ok: true, message: `Summary sent to ${to}` };
      } catch (error) {
        console.error("Could not send the summary", error);
        return { ok: false, error: "The email could not be sent. Try again later." };
      }
    }
    case "import": {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a backup file." };
      if (file.size > MAX_FILE_BYTES) return { ok: false, error: "That file is larger than 2 MB." };
      const parsed = parseBackupCsv(await file.text());
      if ("error" in parsed) return { ok: false, error: parsed.error };
      if (parsed.rules.length === 0) {
        return { ok: false, error: "No valid rule found in the file.", details: parsed.errors };
      }

      const replace = form.get("mode") === "replace";
      const data = parsed.rules.map((rule) => ({ ...rule, shopId: shop.id }));
      const created = await db.$transaction(async (tx) => {
        if (replace) await tx.rule.deleteMany({ where: { shopId: shop.id } });
        return tx.rule.createMany({ data, skipDuplicates: true });
      });
      invalidateVerdictConfig(shop.id);
      if (replace || parsed.customerRulesChanged) {
        const synced = await syncCheckoutValidation(admin, shop.id);
        if (!synced.ok) console.error("Checkout validation sync after import failed", synced.error);
      }

      const added = created.count;
      const existing = parsed.rules.length - added;
      const parts = [`${added} rule${added === 1 ? "" : "s"} ${replace ? "restored" : "added"}`];
      if (existing > 0) parts.push(`${existing} already existed`);
      if (parsed.invalidCount > 0) parts.push(`${parsed.invalidCount} skipped as invalid`);
      return { ok: true, message: parts.join(", "), details: parsed.errors };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
};

export default function BackupAndReports() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const importForm = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(data.reportEmail);
  const [exporting, setExporting] = useState(false);
  useResultToast(fetcher);
  useResultToast(importFetcher, () => importForm.current?.reset());

  const exportRules = async () => {
    setExporting(true);
    try {
      await downloadFile("/app/backup-reports/export", "rules-backup.csv");
    } catch (error) {
      console.error(error);
      shopify.toast.show("Could not export the rules", { isError: true });
    } finally {
      setExporting(false);
    }
  };

  const importDetails = importFetcher.state === "idle" ? importFetcher.data?.details ?? [] : [];
  const importing = importFetcher.state !== "idle";

  return (
    <>
      <PageHeader
        title="Backup & Reports"
        subtitle="Back up and restore all your rules, export visitor records, and get a weekly summary by email."
      />

      <Card>
        <CardSection title="Rules Backup">
          <p>
            Download every rule you have set up (countries, regions, IP
            addresses, bots, referrers, ISPs, URLs, page white lists, block
            lists and order filters) as one CSV file. Keep it as a backup, edit
            it in a spreadsheet, or use it to copy your setup to another store.
          </p>
          <div className={styles.toolbar} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={exportRules}
              disabled={exporting || data.ruleCount === 0}
            >
              <s-icon type="export" /> {exporting ? "Exporting..." : `Export ${data.ruleCount} rules`}
            </button>
          </div>
        </CardSection>
        <CardSection title="Restore from a backup">
          <p>
            Upload a backup file made here. The columns are type, list, match,
            value, comment and enabled; rows that are not valid are skipped
            and listed below. A file can hold up to{" "}
            {BACKUP_MAX_ROWS.toLocaleString("en-US")} rules.
          </p>
          <importFetcher.Form
            method="post"
            encType="multipart/form-data"
            ref={importForm}
            style={{ marginTop: 12, display: "grid", gap: 12 }}
            onSubmit={(event) => {
              const mode = new FormData(event.currentTarget).get("mode");
              if (
                mode === "replace" &&
                !window.confirm("Delete all current rules and replace them with the file? This cannot be undone.")
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="import" />
            <input type="file" name="file" accept=".csv,text/csv" required aria-label="Backup file" />
            <label className={styles.toolbar}>
              <input type="radio" name="mode" value="merge" defaultChecked /> Add to my current rules
              (rules I already have are kept)
            </label>
            <label className={styles.toolbar}>
              <input type="radio" name="mode" value="replace" /> Replace all my current rules with the
              file
            </label>
            <div>
              <button type="submit" className={styles.primaryButton} disabled={importing}>
                <s-icon type="import" /> {importing ? "Importing..." : "Import rules"}
              </button>
            </div>
          </importFetcher.Form>
          {importDetails.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Banner tone="warning">
                <p>
                  <strong>Some rows were skipped:</strong>
                </p>
                <ul>
                  {importDetails.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Visitor Records Export">
          <p>
            Visitor records can be downloaded as a CSV file from{" "}
            <Link to="/app/visitor-logs">Shop Visitor Logs</Link> with the
            Export CSV button. The file follows the filters you have chosen
            there and holds up to 50,000 of the newest records.
          </p>
        </CardSection>
      </Card>

      <Card>
        <CardSection title="Weekly Email Summary">
          <p>
            Get a short email every week with how many page views were
            checked, how many visitors were blocked or redirected, the most
            blocked countries, and the orders your order filters handled.
          </p>
          {!data.canSend && (
            <div style={{ marginTop: 12 }}>
              <Banner tone="warning">
                <p>Email sending is not set up on this app yet, so summaries cannot be sent for now.</p>
              </Banner>
            </div>
          )}
        </CardSection>
        <CardSection>
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Send the summary to</span>
              <input
                name="email"
                type="email"
                className={styles.input}
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>
            <StatusToggle
              name="weeklyReport"
              enabled={data.weeklyReportEnabled}
              onToggle={(next) =>
                fetcher.submit(
                  next ? { intent: "report", enabled: "on", email } : { intent: "report", email },
                  { method: "POST" },
                )
              }
              label={
                data.weeklyReportEnabled
                  ? "The weekly summary is on."
                  : "The weekly summary is off."
              }
            />
            {data.lastReportAt && (
              <p>Last summary sent {new Date(data.lastReportAt).toLocaleString()}.</p>
            )}
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.outlineButton}
                disabled={!data.canSend || fetcher.state !== "idle"}
                onClick={() => fetcher.submit({ intent: "sendNow", email }, { method: "POST" })}
              >
                <s-icon type="email" /> Send a summary now
              </button>
            </div>
          </div>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
