import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { ReactNode } from "react";

import { authenticate } from "../shopify.server";
import { APP_NAME } from "../lib/app-info";
import { FREE_VIEWS, PREMIUM_PRICE, PRICE_PER_CHARGE, USAGE_CAP, VIEWS_PER_CHARGE } from "../lib/billing";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Card, CardSection } from "../components/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const FAQS: { question: string; answer: ReactNode }[] = [
  {
    question: "The app is installed but nothing is blocked. What is missing?",
    answer: (
      <>
        Two things must be on: the {APP_NAME} app embed in your theme (see{" "}
        <Link to="/app/extension">App extension</Link>) and the filters switch
        in <Link to="/app/settings">General Settings</Link>. A plan must also
        be active.
      </>
    ),
  },
  {
    question: "How do I keep myself from being blocked while I test?",
    answer: (
      <>
        Turn on Admin Access in <Link to="/app/settings">General Settings</Link>{" "}
        and open the invitation link on each of your devices. Those devices
        skip every filter and are not counted as page views.
      </>
    ),
  },
  {
    question: "Will search engines and ad platforms still reach my store?",
    answer:
      "Yes. Known crawlers such as Googlebot, Bingbot and the ad networks' checkers are verified by their network and let in, so blocking countries or VPNs does not hurt your SEO or ads.",
  },
  {
    question: "Which rule wins when several match?",
    answer:
      "Page White Lists and the IP whitelist come first, then the IP blacklist, crawler lists, Block Lists, the referrer, URL and ISP/ASN blockers, the VPN/proxy blocker and finally the Country Blocker. Geolocation Redirects only apply to visitors every filter let in.",
  },
  {
    question: "Why do blocked visitors still show up in Shopify's reports?",
    answer:
      "Shopify counts a visit as soon as it arrives, before any app can act on it. The visitor still sees your block page and cannot shop.",
  },
  {
    question: "A real customer was blocked. How do I let them in?",
    answer: (
      <>
        Find them in <Link to="/app/visitor-logs">Shop Visitor Logs</Link> to
        see which rule matched, then add their IP to the IP whitelist or
        remove the rule. Users of iCloud Private Relay and similar services can
        be allowed with Organization Whitelists on the Bot(VPN/Proxy) Blocker
        page.
      </>
    ),
  },
  {
    question: "Can the app stop orders, not just visits?",
    answer: (
      <>
        Yes. <Link to="/app/customer-block-lists">Customer Block Lists</Link>{" "}
        stops checkout for chosen emails, phones, names or ZIP codes,{" "}
        <Link to="/app/auto-cancel-filters">Auto-cancel filters</Link> cancel
        orders from buyers on your list, and{" "}
        <Link to="/app/fraud-protect">Fraud Protect</Link> cancels orders
        Shopify rates as risky.
      </>
    ),
  },
  {
    question: "How much does it cost?",
    answer: (
      <>
        Pay as you go is free for the first {FREE_VIEWS} page views every 30
        days, then ${PRICE_PER_CHARGE.toFixed(2)} per {VIEWS_PER_CHARGE} views,
        never more than ${USAGE_CAP} per 30 days. Premium is ${PREMIUM_PRICE}{" "}
        every 30 days with unlimited views. See <Link to="/app/plans">Plans</Link>.
      </>
    ),
  },
  {
    question: "What happens to my settings if I uninstall?",
    answer:
      "The storefront script stops at once. Your rules are kept for 48 hours in case you reinstall, then deleted together with all visitor records.",
  },
];

export default function Faq() {
  return (
    <>
      <PageHeader title="FAQ" subtitle="Answers to the questions merchants ask most." />
      <Card>
        <CardSection>
          <div style={{ display: "grid", gap: 8 }}>
            {FAQS.map((faq) => (
              <details key={faq.question} className={styles.panel}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{faq.question}</summary>
                <p style={{ marginBottom: 0 }}>{faq.answer}</p>
              </details>
            ))}
          </div>
          <p className={styles.helpText}>
            Still stuck? <Link to="/app/contact">Contact us</Link>.
          </p>
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
