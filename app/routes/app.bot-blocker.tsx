import { useState } from "react";
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
import { addRules, invalidateVerdictConfig } from "../models/rules.server";
import { getBlockerConfig, saveHandling, type ActionResult } from "../models/blocker.server";
import { handleListIntent, loadList, type ListSpec } from "../models/list-rules.server";
import { TRUSTED_BOTS } from "../lib/bots";
import { WIDELY_USED_ORGANIZATIONS } from "../lib/rule-specs";
import { isChecked } from "../lib/settings";
import { APP_NAME } from "../lib/app-info";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection, ContactUsButton, StatusToggle } from "../components/ui";
import { HandlingCard, useResultToast } from "../components/blockers";
import { RuleListCard } from "../components/rule-list";

const ORGANIZATIONS: ListSpec = { type: "ORGANIZATION", list: "WHITELIST", prefix: "org" };
const CRAWLERS: ListSpec = { type: "CRAWLER", list: ["BLACKLIST", "WHITELIST"], prefix: "bot" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const url = new URL(request.url);
  const [organizations, crawlers, handling] = await Promise.all([
    loadList(url, shop.id, ORGANIZATIONS),
    loadList(url, shop.id, CRAWLERS),
    getBlockerConfig(shop.id, "BOT_VPN"),
  ]);
  return {
    enabled: shop.settings.botBlockerEnabled,
    organizations,
    crawlers,
    handling,
    trustedBots: TRUSTED_BOTS.map((bot) => bot.name),
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopWithSettings(session.shop);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "toggle": {
      const botBlockerEnabled = isChecked(form.get("enabled"));
      await db.settings.update({ where: { shopId: shop.id }, data: { botBlockerEnabled } });
      invalidateVerdictConfig(shop.id);
      return { ok: true, message: botBlockerEnabled ? "Bot Blocker enabled" : "Bot Blocker disabled" };
    }
    case "addWidelyUsed": {
      const added = await addRules(
        shop.id,
        "ORGANIZATION",
        "WHITELIST",
        WIDELY_USED_ORGANIZATIONS.map((value) => ({ value, matchType: "PARTIAL" as const })),
      );
      return { ok: true, message: added ? `${added} organizations added` : "Already on the list" };
    }
    case "handling":
      return saveHandling(shop.id, "BOT_VPN", form);
    default:
      return (
        (await handleListIntent(shop.id, form, [ORGANIZATIONS, CRAWLERS])) ?? {
          ok: false,
          error: "Unknown action.",
        }
      );
  }
};

export default function BotBlocker() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showBots, setShowBots] = useState(false);
  useResultToast(fetcher);

  return (
    <>
      <PageHeader
        title="Bot(VPN/Proxy) Blocker"
        subtitle="Stop bots and visitors hiding behind VPN, Tor or proxy connections."
      />

      <Banner>
        <p>
          {APP_NAME} works on your storefront pages; Shopify does not let apps
          run on the checkout page itself. If bots create abandoned checkouts
          or fake accounts, contact us and we will help.
        </p>
        <ContactUsButton />
      </Banner>

      <Card>
        <CardSection>
          <StatusToggle
            name="botBlocker"
            enabled={data.enabled}
            onToggle={(next) =>
              fetcher.submit(next ? { intent: "toggle", enabled: "on" } : { intent: "toggle" }, {
                method: "POST",
              })
            }
            label={`Bot Blocker (VPN/Tor/Proxy) (${data.enabled ? "Enabled" : "Disabled"})`}
          />
          <div style={{ marginTop: 12 }}>
            <Banner tone="warning">
              <p>
                Not every VPN user is up to something: Apple&apos;s iCloud
                Private Relay, for example, hides the address of many iPhone
                shoppers. Let such visitors in with the Organization
                Whitelists below or the IP Blocker whitelist.
              </p>
            </Banner>
          </div>
        </CardSection>
        <CardSection title="Organization Whitelists">
          <p>
            Visitors whose network belongs to an organization on this list
            are never treated as VPN or proxy traffic. Add the privacy relays
            and corporate networks most real shoppers use in one click.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => fetcher.submit({ intent: "addWidelyUsed" }, { method: "POST" })}
          >
            Add Widely-Used Organizations
          </button>
        </CardSection>
      </Card>

      <RuleListCard
        data={data.organizations}
        prefix="org"
        help={
          <>
            <h2>Organization Whitelists</h2>
            <p>
              Find a visitor&apos;s organization on the Shop Visitor Logs page.
              Names match when the organization contains your text.
            </p>
          </>
        }
        searchPlaceholder="Search Organization whitelist"
        addLabel="Add Organization Whitelist"
        emptyTitle="No organization whitelist found"
        valueHeading="Organization Name"
        valuePlaceholder="iCloud Private Relay"
        types={[{ value: "ORGANIZATION", label: "Organization" }]}
        lists={[{ value: "WHITELIST", label: "Allow" }]}
      />

      <HandlingCard blockerName="Bot/VPN blocker" config={data.handling} />

      <Banner tone="success">
        <p>
          Verified search engine and advertising crawlers (for SEO and ad
          reviews) are always let in, whatever your blockers say. Crawlers
          that only pretend to be one of them are blocked while the Bot
          Blocker is on.
        </p>
        <button
          type="button"
          className={styles.primaryButton}
          aria-expanded={showBots}
          onClick={() => setShowBots((open) => !open)}
        >
          View whitelisted bots
        </button>
        {showBots && (
          <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
            {data.trustedBots.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </Banner>

      <RuleListCard
        data={data.crawlers}
        prefix="bot"
        help={
          <>
            <h2>Web crawler(bot) block/allow list</h2>
            <p>
              Block or allow other crawlers by a word from their user agent,
              such as AhrefsBot or SemrushBot. Turn on &quot;Show Bot Visits
              Only&quot; on the Shop Visitor Logs page to find them.
            </p>
          </>
        }
        searchPlaceholder="Search filter"
        addLabel="Add Bot/Webcrawler filter"
        emptyTitle="No Bot/Webcrawler filter found"
        valueHeading="User agent contains"
        valuePlaceholder="AhrefsBot"
        types={[{ value: "CRAWLER", label: "Crawler" }]}
        lists={[
          { value: "BLACKLIST", label: "Block" },
          { value: "WHITELIST", label: "Allow" },
        ]}
      />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
