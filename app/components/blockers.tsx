import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useFetcher, useRevalidator, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { APP_NAME } from "../lib/app-info";
import {
  BLOCK_TEMPLATES,
  DEFAULT_HEADER,
  DEFAULT_MESSAGE,
  HANDLING_OPTIONS,
  type BlockHandling,
} from "../lib/block-handling";
import { frameStyles as styles } from "./AppFrame";
import { Banner, Card, CardSection } from "./ui";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Shows the action's message or error as a toast once a fetcher finishes.
export function useResultToast(
  fetcher: { state: string; data?: Result },
  onSuccess?: (message: string) => void,
) {
  const shopify = useAppBridge();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      shopify.toast.show(fetcher.data.message);
      onSuccess?.(fetcher.data.message);
    } else {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
    // onSuccess is usually an inline function; the data change is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data, shopify]);
}

export interface HandlingConfig {
  handling: BlockHandling;
  header: string;
  message: string;
  redirectUrl: string | null;
  templateId: string | null;
  sectionSelector: string | null;
}

function SaveButton({ busy }: { busy: boolean }) {
  return (
    <button type="submit" className={styles.primaryButton} disabled={busy}>
      {busy ? "Saving..." : "Save"}
    </button>
  );
}

function MessageFields({ config }: { config: HandlingConfig }) {
  return (
    <>
      <label className={styles.fieldLabel} htmlFor="handling-header">
        Header
      </label>
      <input
        id="handling-header"
        className={styles.input}
        name="header"
        defaultValue={config.header || DEFAULT_HEADER}
        maxLength={200}
      />
      <label className={styles.fieldLabel} htmlFor="handling-message">
        Message
      </label>
      <textarea
        id="handling-message"
        className={styles.textarea}
        name="message"
        defaultValue={config.message || DEFAULT_MESSAGE}
        maxLength={2000}
      />
    </>
  );
}

// "How would you like the app to handle blocked visitors (For X)?"
export function HandlingCard({
  blockerName,
  config,
  disabledOptions = [],
  defaultRedirect,
}: {
  blockerName: string;
  config: HandlingConfig;
  // Options this blocker cannot use, shown greyed out.
  disabledOptions?: BlockHandling[];
  // Offered by a "Use default" button next to the redirect page.
  defaultRedirect?: string;
}) {
  const fetcher = useFetcher<Result>();
  const [selected, setSelected] = useState<BlockHandling>(
    disabledOptions.includes(config.handling) ? "REDIRECT" : config.handling,
  );
  const [redirectUrl, setRedirectUrl] = useState(config.redirectUrl ?? defaultRedirect ?? "");
  const busy = fetcher.state !== "idle";
  useResultToast(fetcher);

  const body: Record<BlockHandling, ReactNode> = {
    CUSTOM_INFO: (
      <>
        <MessageFields config={config} />
        <div style={{ marginTop: 12 }}>
          <SaveButton busy={busy} />
        </div>
      </>
    ),
    REDIRECT: (
      <>
        <label className={styles.fieldLabel} htmlFor="handling-redirect">
          Redirect page:
        </label>
        <div className={styles.formRow}>
          <input
            id="handling-redirect"
            className={styles.input}
            name="redirectUrl"
            placeholder="https://example.com/pages/not-available"
            value={redirectUrl}
            onChange={(event) => setRedirectUrl(event.target.value)}
          />
          <SaveButton busy={busy} />
          {defaultRedirect && (
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => setRedirectUrl(defaultRedirect)}
            >
              Use default
            </button>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <Banner tone="warning">
            <p>
              The redirect page itself is never blocked. Make sure the page
              exists: redirecting to a missing page can send visitors round in
              a loop.
            </p>
          </Banner>
        </div>
      </>
    ),
    TEMPLATE: (
      <>
        <div className={styles.templateGrid}>
          {BLOCK_TEMPLATES.map((template) => (
            <label key={template.id} className={styles.templateOption}>
              <span>
                <input
                  type="radio"
                  name="templateId"
                  value={template.id}
                  defaultChecked={(config.templateId ?? "classic") === template.id}
                />{" "}
                <strong>{template.name}</strong>
              </span>
              <span className={styles.muted}>{template.description}</span>
            </label>
          ))}
        </div>
        <MessageFields config={config} />
        <div style={{ marginTop: 12 }}>
          <SaveButton busy={busy} />
        </div>
      </>
    ),
    HIDE_SECTION: (
      <>
        <label className={styles.fieldLabel} htmlFor="handling-selector">
          Section to hide (CSS selector)
        </label>
        <div className={styles.formRow}>
          <input
            id="handling-selector"
            className={styles.input}
            name="sectionSelector"
            placeholder="#shopify-section-header, .product-form"
            defaultValue={config.sectionSelector ?? ""}
          />
          <SaveButton busy={busy} />
        </div>
        <p className={styles.helpText}>
          Blocked visitors can still see the page, but these sections are
          hidden from them, for example the add-to-cart form or prices.
        </p>
      </>
    ),
  };

  return (
    <Card>
      <CardSection
        title={`How would you like ${APP_NAME} to handle blocked visitors (For ${blockerName})?`}
      >
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="handling" />
          <div className={styles.radioList}>
            {HANDLING_OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              const isDisabled = disabledOptions.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={
                    isSelected
                      ? `${styles.radioOption} ${styles.radioOptionSelected}`
                      : styles.radioOption
                  }
                >
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="handling"
                      value={option.value}
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => setSelected(option.value)}
                    />
                    <span className={isDisabled ? styles.muted : undefined}>
                      {option.label}
                      {isDisabled && ` (This option does not support ${blockerName})`}
                    </span>
                  </label>
                  {isSelected && <div className={styles.radioBody}>{body[option.value]}</div>}
                </div>
              );
            })}
          </div>
        </fetcher.Form>
      </CardSection>
    </Card>
  );
}

// "N records in total" with previous/next links that keep other filters.
export function Pagination({
  total,
  page,
  pageCount,
  prefix = "",
}: {
  total: number;
  page: number;
  pageCount: number;
  // Lets several paginated lists share one page's URL.
  prefix?: string;
}) {
  const [params] = useSearchParams();
  const hrefFor = (target: number) => {
    const next = new URLSearchParams(params);
    next.set(`${prefix}page`, String(target));
    return `?${next.toString()}`;
  };
  return (
    <div className={styles.pagination}>
      <span>{total} records in total</span>
      <div className={styles.toolbar}>
        {page > 1 ? (
          <Link className={styles.iconButton} to={hrefFor(page - 1)} aria-label="Previous page">
            <s-icon type="chevron-left" />
          </Link>
        ) : (
          <span className={styles.iconButton} aria-hidden="true">
            <s-icon type="chevron-left" tone="neutral" />
          </span>
        )}
        <span>
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link className={styles.iconButton} to={hrefFor(page + 1)} aria-label="Next page">
            <s-icon type="chevron-right" />
          </Link>
        ) : (
          <span className={styles.iconButton} aria-hidden="true">
            <s-icon type="chevron-right" tone="neutral" />
          </span>
        )}
      </div>
    </div>
  );
}

// Search box that updates the "q" URL parameter, resetting to page 1.
export function SearchBox({ placeholder, prefix = "" }: { placeholder: string; prefix?: string }) {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get(`${prefix}q`) ?? "");
  return (
    <form
      className={styles.formRow}
      style={{ flex: 1 }}
      onSubmit={(event) => {
        event.preventDefault();
        const next = new URLSearchParams(params);
        if (value.trim()) next.set(`${prefix}q`, value.trim());
        else next.delete(`${prefix}q`);
        next.delete(`${prefix}page`);
        setParams(next, { preventScrollReset: true });
      }}
    >
      <input
        className={styles.input}
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}

export function ReloadButton() {
  const revalidator = useRevalidator();
  return (
    <button
      type="button"
      className={styles.outlineButton}
      disabled={revalidator.state === "loading"}
      onClick={() => revalidator.revalidate()}
    >
      <s-icon type="refresh" /> Reload
    </button>
  );
}
