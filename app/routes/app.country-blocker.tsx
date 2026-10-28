import { useMemo, useState } from "react";
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
import { addRules, deleteRules, invalidateVerdictConfig } from "../models/rules.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import {
  countryName,
  countryOptions,
  isCountryCode,
  regionRuleValue,
  splitRegionRule,
} from "../lib/countries";
import { flagEmoji } from "../lib/format";
import { isChecked } from "../lib/settings";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, StatusToggle } from "../components/ui";
import { HandlingCard, useResultToast } from "../components/blockers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const mode = shop.settings.countryMode;
  const [rules, handling] = await Promise.all([
    db.rule.findMany({
      where: { shopId: shop.id, list: mode, type: { in: ["COUNTRY", "STATE", "CITY"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, value: true },
    }),
    getBlockerConfig(shop.id, "COUNTRY"),
  ]);

  return {
    mode,
    blockByStateCity: shop.settings.blockByStateCity,
    countries: rules.filter((rule) => rule.type === "COUNTRY").map((rule) => rule.value),
    places: rules
      .filter((rule) => rule.type !== "COUNTRY")
      .map((rule) => {
        const { country, place } = splitRegionRule(rule.value);
        return { id: rule.id, type: rule.type, country, place };
      }),
    options: countryOptions(),
    handling,
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const mode = shop.settings.countryMode;
  const form = await request.formData();

  switch (form.get("intent")) {
    case "mode": {
      const countryMode = form.get("mode") === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
      await db.settings.update({ where: { shopId: shop.id }, data: { countryMode } });
      invalidateVerdictConfig(shop.id);
      return {
        ok: true,
        message: countryMode === "WHITELIST" ? "Whitelist mode on" : "Blacklist mode on",
      };
    }
    case "addCountry": {
      const code = String(form.get("code") ?? "").toUpperCase();
      if (!isCountryCode(code)) return { ok: false, error: "Choose a country from the list." };
      await addRules(shop.id, "COUNTRY", mode, [{ value: code }]);
      return { ok: true, message: `${countryName(code)} added` };
    }
    case "removeCountry": {
      const code = String(form.get("code") ?? "");
      await deleteRules(shop.id, { type: "COUNTRY", list: mode, value: code });
      return { ok: true, message: `${countryName(code)} removed` };
    }
    case "removeAll": {
      await deleteRules(shop.id, { type: "COUNTRY", list: mode });
      return { ok: true, message: "All countries removed" };
    }
    case "stateCity": {
      const blockByStateCity = isChecked(form.get("enabled"));
      await db.settings.update({ where: { shopId: shop.id }, data: { blockByStateCity } });
      invalidateVerdictConfig(shop.id);
      return {
        ok: true,
        message: blockByStateCity
          ? "Blocking by states/provinces/cities enabled"
          : "Blocking by states/provinces/cities disabled",
      };
    }
    case "addPlace": {
      const type = form.get("type") === "CITY" ? "CITY" : "STATE";
      const country = String(form.get("country") ?? "").toUpperCase();
      const place = String(form.get("place") ?? "").trim();
      if (!isCountryCode(country)) return { ok: false, error: "Choose a country." };
      if (place === "" || place.length > 100) {
        return {
          ok: false,
          error: type === "CITY" ? "Enter a city name." : "Enter a state or province name or code.",
        };
      }
      const added = await addRules(shop.id, type, mode, [
        { value: regionRuleValue(country, place) },
      ]);
      return added
        ? { ok: true, message: `${place} added` }
        : { ok: false, error: "That place is already on the list." };
    }
    case "deletePlace": {
      await deleteRules(shop.id, {
        id: String(form.get("id")),
        type: { in: ["STATE", "CITY"] },
      });
      return { ok: true, message: "Place removed" };
    }
    case "handling":
      return saveHandling(shop.id, "COUNTRY", form);
    default:
      return { ok: false, error: "Unknown action." };
  }
};

function CountryPicker({
  selected,
  options,
  verb,
}: {
  selected: string[];
  options: { code: string; name: string }[];
  verb: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  useResultToast(fetcher);

  const names = useMemo(() => new Map(options.map((option) => [option.code, option.name])), [options]);
  const matches = options
    .filter((option) => !selected.includes(option.code))
    .filter((option) => {
      const text = query.trim().toLowerCase();
      return !text || option.name.toLowerCase().includes(text) || option.code.toLowerCase() === text;
    })
    .slice(0, 50);

  const submit = (values: Record<string, string>) => fetcher.submit(values, { method: "POST" });

  return (
    <>
      <label className={styles.fieldLabel} htmlFor="country-search">
        {verb} countries:
      </label>
      <div className={styles.toolbar} style={{ alignItems: "flex-start" }}>
        <div className={styles.picker} style={{ flex: 1 }}>
          <input
            id="country-search"
            className={styles.input}
            placeholder="Please select countries"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          />
          {open && matches.length > 0 && (
            <ul className={styles.pickerList} role="listbox">
              {matches.map((option) => (
                <li key={option.code}>
                  <button
                    type="button"
                    className={styles.pickerItem}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      submit({ intent: "addCountry", code: option.code });
                      setQuery("");
                    }}
                  >
                    <span aria-hidden="true">{flagEmoji(option.code)}</span>
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={selected.length === 0}
          onClick={() => {
            if (window.confirm("Remove every country from this list?")) submit({ intent: "removeAll" });
          }}
        >
          Remove All
        </button>
      </div>
      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((code) => (
            <span key={code} className={styles.chip}>
              <span aria-hidden="true">{flagEmoji(code)}</span>
              {names.get(code) ?? code}
              <button
                type="button"
                aria-label={`Remove ${names.get(code) ?? code}`}
                onClick={() => submit({ intent: "removeCountry", code })}
              >
                <s-icon type="x" size="small" />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function PlaceRules({
  places,
  options,
  verb,
}: {
  places: { id: string; type: string; country: string; place: string }[];
  options: { code: string; name: string }[];
  verb: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  useResultToast(fetcher, (message) => {
    if (message.endsWith(" added")) form?.reset();
  });

  return (
    <div className={styles.panel}>
      <p style={{ marginTop: 0 }}>
        {verb} individual states, provinces or cities. Use the name as it is
        commonly written in English (for example California or Ontario), or
        the region code (CA, ON).
      </p>
      <fetcher.Form method="post" ref={setForm} className={styles.formRow}>
        <input type="hidden" name="intent" value="addPlace" />
        <div>
          <label className={styles.fieldLabel} htmlFor="place-type">
            Type
          </label>
          <select id="place-type" name="type" className={styles.select}>
            <option value="STATE">State/Province</option>
            <option value="CITY">City</option>
          </select>
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="place-country">
            Country
          </label>
          <select id="place-country" name="country" className={styles.select} required>
            <option value="">Select a country</option>
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="place-name">
            Name
          </label>
          <input id="place-name" name="place" className={styles.input} required maxLength={100} />
        </div>
        <button type="submit" className={styles.primaryButton}>
          Add
        </button>
      </fetcher.Form>

      {places.length > 0 && (
        <table className={styles.table} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Place</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {places.map((place) => (
              <tr key={place.id}>
                <td>{place.type === "CITY" ? "City" : "State/Province"}</td>
                <td>
                  <span aria-hidden="true">{flagEmoji(place.country)}</span>{" "}
                  <span style={{ textTransform: "capitalize" }}>{place.place}</span>,{" "}
                  {place.country}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove ${place.place}`}
                    onClick={() =>
                      fetcher.submit({ intent: "deletePlace", id: place.id }, { method: "POST" })
                    }
                  >
                    <s-icon type="delete" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CountryBlocker() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);
  const isWhitelist = data.mode === "WHITELIST";
  const verb = isWhitelist ? "Allow" : "Block";

  const modes = [
    {
      value: "BLACKLIST",
      label: "Blacklist (Block Mode)",
      hint: "Visitors from countries on the list cannot visit your store.",
    },
    {
      value: "WHITELIST",
      label: "Whitelist (Allow Mode)",
      hint: "Only visitors from countries on the list can visit your store.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Country Blocker"
        subtitle="Keep visitors from chosen countries or regions out of your store."
      />

      <Card>
        <CardSection>
          <Banner>
            <p>
              Choose an access mode: Blacklist blocks the countries you pick,
              Whitelist lets in only the countries you pick. Each mode keeps
              its own list.
            </p>
          </Banner>
          <div className={styles.radioList} style={{ marginTop: 16 }}>
            {modes.map((mode) => {
              const selected = data.mode === mode.value;
              return (
                <div
                  key={mode.value}
                  className={
                    selected ? `${styles.radioOption} ${styles.radioOptionSelected}` : styles.radioOption
                  }
                >
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="mode"
                      value={mode.value}
                      checked={selected}
                      onChange={() =>
                        fetcher.submit({ intent: "mode", mode: mode.value }, { method: "POST" })
                      }
                    />
                    <span>
                      {mode.label}
                      <span className={styles.radioHint}>{mode.hint}</span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </CardSection>

        <CardSection
          title={`Please indicate the countries to add to your ${isWhitelist ? "Whitelist" : "Blacklist"}`}
        >
          <CountryPicker
            key={data.mode}
            selected={data.countries}
            options={data.options}
            verb={verb}
          />
          {isWhitelist && data.countries.length === 0 && (
            <p className={styles.helpText}>
              Your whitelist is empty, so visitors from every country can
              still visit. Add at least one country to turn it on.
            </p>
          )}
        </CardSection>

        <CardSection>
          <StatusToggle
            name="blockByStateCity"
            enabled={data.blockByStateCity}
            onToggle={(next) =>
              fetcher.submit(
                next ? { intent: "stateCity", enabled: "on" } : { intent: "stateCity" },
                { method: "POST" },
              )
            }
            label={`${verb} by States/Provinces/Cities (${
              data.blockByStateCity ? "Enabled" : "Disabled"
            })`}
          />
          {data.blockByStateCity && (
            <PlaceRules places={data.places} options={data.options} verb={verb} />
          )}
        </CardSection>
      </Card>

      <HandlingCard blockerName="country blocker" config={data.handling} />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
