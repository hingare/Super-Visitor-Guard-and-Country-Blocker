import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopWithSettings } from "../models/shop.server";
import { invalidateVerdictConfig } from "../models/rules.server";
import type { ActionResult } from "../models/blocker.server";
import { countryName, countryOptions } from "../lib/countries";
import { flagEmoji } from "../lib/format";
import { MAX_GEO_REDIRECTS, parseGeoRedirectForm } from "../lib/geo-redirect";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, EmptyState } from "../components/ui";
import { SearchBox, useResultToast } from "../components/blockers";
import { CountryMultiSelect } from "../components/country-select";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const redirects = await db.geoRedirect.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });
  const filtered = q
    ? redirects.filter(
        (item) =>
          item.targetUrl.toLowerCase().includes(q) ||
          item.countries.some(
            (code) => code.toLowerCase() === q || countryName(code).toLowerCase().includes(q),
          ),
      )
    : redirects;
  return { redirects: filtered, total: redirects.length, options: countryOptions() };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");

  switch (form.get("intent")) {
    case "create":
    case "update": {
      const parsed = parseGeoRedirectForm(form);
      if (!parsed.ok) return parsed;
      const data = { countries: parsed.countries, targetUrl: parsed.targetUrl };
      if (form.get("intent") === "create") {
        const count = await db.geoRedirect.count({ where: { shopId: shop.id } });
        if (count >= MAX_GEO_REDIRECTS) {
          return { ok: false, error: `You can have up to ${MAX_GEO_REDIRECTS} redirect rules.` };
        }
        await db.geoRedirect.create({ data: { shopId: shop.id, ...data } });
      } else {
        await db.geoRedirect.updateMany({ where: { id, shopId: shop.id }, data });
      }
      invalidateVerdictConfig(shop.id);
      return { ok: true, message: "Redirect rule saved" };
    }
    case "toggle": {
      const enabled = form.get("enabled") === "true";
      await db.geoRedirect.updateMany({ where: { id, shopId: shop.id }, data: { enabled } });
      invalidateVerdictConfig(shop.id);
      return { ok: true, message: enabled ? "Redirect rule on" : "Redirect rule off" };
    }
    case "delete": {
      await db.geoRedirect.deleteMany({ where: { id, shopId: shop.id } });
      invalidateVerdictConfig(shop.id);
      return { ok: true, message: "Redirect rule deleted" };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
};

type Options = { code: string; name: string }[];

function RedirectForm({
  options,
  initial,
  onDone,
}: {
  options: Options;
  initial?: { id: string; countries: string[]; targetUrl: string };
  onDone: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(fetcher, () => onDone());
  const prefix = initial ? `edit-${initial.id}` : "new";

  return (
    <fetcher.Form method="post" ref={formRef} className={styles.panel}>
      <input type="hidden" name="intent" value={initial ? "update" : "create"} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className={styles.fieldLabel} htmlFor={`${prefix}-countries`}>
        Visitors from these countries
      </label>
      <CountryMultiSelect id={`${prefix}-countries`} options={options} defaultValue={initial?.countries} />
      <label className={styles.fieldLabel} htmlFor={`${prefix}-url`}>
        are sent to
      </label>
      <input
        id={`${prefix}-url`}
        name="targetUrl"
        className={styles.input}
        placeholder="https://de.example.com"
        defaultValue={initial?.targetUrl}
        required
      />
      <div className={styles.toolbar} style={{ marginTop: 12 }}>
        <button type="submit" className={styles.primaryButton}>
          Save
        </button>
        <button type="button" className={styles.outlineButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </fetcher.Form>
  );
}

function RedirectRow({
  redirect,
  options,
}: {
  redirect: { id: string; countries: string[]; targetUrl: string; enabled: boolean };
  options: Options;
}) {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = useState(false);
  useResultToast(fetcher);

  if (editing) {
    return (
      <tr>
        <td colSpan={4}>
          <RedirectForm options={options} initial={redirect} onDone={() => setEditing(false)} />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        {redirect.countries.map((code) => (
          <div key={code}>
            {flagEmoji(code)} {countryName(code)}
          </div>
        ))}
      </td>
      <td style={{ wordBreak: "break-all" }}>
        <a href={redirect.targetUrl} target="_blank" rel="noreferrer">
          {redirect.targetUrl}
        </a>
      </td>
      <td>
        <s-switch
          accessibilityLabel="Rule on or off"
          checked={redirect.enabled}
          onChange={(event) =>
            fetcher.submit(
              { intent: "toggle", id: redirect.id, enabled: String(event.currentTarget.checked) },
              { method: "POST" },
            )
          }
        />
      </td>
      <td>
        <div className={styles.toolbar} style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Edit redirect rule"
            onClick={() => setEditing(true)}
          >
            <s-icon type="edit" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Delete redirect rule"
            onClick={() => fetcher.submit({ intent: "delete", id: redirect.id }, { method: "POST" })}
          >
            <s-icon type="delete" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function GeolocationRedirects() {
  const data = useLoaderData<typeof loader>();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Geolocation Redirects"
        subtitle="Send visitors to the right local store based on where they are."
      />

      <Banner tone="warning">
        <p>
          <strong>Geolocation Redirects come after all other filters.</strong>{" "}
          A visitor who is blocked, for example because their country is on
          your Country Blocker list, is never redirected. Admin Access devices
          and bots are not redirected either.
        </p>
      </Banner>

      <Card>
        <CardSection>
          <p style={{ marginTop: 0 }}>
            Choose countries and the store address their visitors should go to,
            such as your German store for visitors from Germany and Austria.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setCreating((open) => !open)}
          >
            Create Redirect Rules
          </button>
          {creating && <RedirectForm options={data.options} onDone={() => setCreating(false)} />}
        </CardSection>
      </Card>

      <Card>
        <CardSection title="All current settings for Geolocation Redirects">
          <div className={styles.toolbar}>
            <SearchBox placeholder="Search redirect records" />
          </div>
        </CardSection>
        {data.redirects.length === 0 ? (
          <EmptyState
            title="No redirect record found"
            text="Try changing the filters or create a new one."
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Countries</th>
                <th>Redirect to</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.redirects.map((redirect) => (
                <RedirectRow key={redirect.id} redirect={redirect} options={data.options} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
