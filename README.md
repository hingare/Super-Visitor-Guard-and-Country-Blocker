# Super Visitor Guard and Country Blocker

A Shopify app that blocks unwanted visitors and orders: country / state / city /
IP / VPN / bot / ISP / referrer blocking, checkout validation, fraud order
handling, content protection, geo redirects and a visit log.

Built on Shopify's official React Router app template with Polaris web
components, Prisma and PostgreSQL.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: data model, sidebar layout, Dashboard, General Settings, App extension page, app embed, webhooks | Done |
| 2 | Verdict engine and storefront script; Country Blocker, IP Blocker, Page White Lists; per-blocker block handling; Admin Access, Auto-Whitelist, Preload Mask and Selective Page Filtering on the storefront | Done |
| 3 | Bot(VPN/Proxy) Blocker with organization and crawler lists, Referrer, ISP/ASN and URL blockers, Block Lists(Legacy) | Done |
| 4 | Shop Visitor Logs (visitor ids, aliases, quick block, filters), IP Address Lookup | Done |
| 5 | Content Protection, Geolocation Redirects | Done |
| 6 | Customer Block Lists (checkout validation function), Fraud Protect, Auto-cancel filters, order cancel/refund/delete settings | Done |
| 7 | Billing: Pay as you go and Premium plans, page-view metering, Plans page | Done |
| 8 | Contact Us, FAQ, cancelled-order emails, hardening (log rate limit, visit retention) | Done; App Store submission next |
| 9 | Backup & Reports: rules backup and restore (CSV), visitor records CSV export, weekly email summary | Done |

## Local development

Requirements: Node 22.12+, PostgreSQL 14+, Shopify CLI, a Partner account and
a development store.

```shell
cp .env.example .env          # local defaults: Docker DB, Mailpit, billing off
npm install
npm run services:up           # PostgreSQL + Mailpit (docker-compose.dev.yml)
npx prisma migrate deploy
npm run config:link           # connect to your app in the Partner Dashboard
npm run check:local           # checks DB, migrations, GeoIP, SMTP, app link
npm run dev                   # shopify app dev
npm run seed:demo             # optional demo data (after opening the app once)
```

Full manual test guide (Bengali), with test parameters (`vg_test_country`,
`vg_test_ip`, `vg_test_vpn`, `vg_test_org`, `vg_test_asn`) and a page-by-page
checklist: [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md). Emails sent locally
land in Mailpit at http://localhost:8025.

Visitor locations come from a MaxMind GeoLite2-City (free, needs a MaxMind
account) or GeoIP2-City database. Download the `.mmdb` file and point
`GEOIP_CITY_DB` at it; the file is reloaded when it changes. Without it the
Country Blocker cannot locate visitors and lets everyone through.

Two more databases are optional: `GEOIP_ASN_DB` (GeoLite2-ASN, free) gives
each visitor's network number and organization for the ISP/ASN Blocker, and
`GEOIP_ANON_DB` (GeoIP2 Anonymous IP, paid) flags VPN, proxy and hosting
addresses. Without the anonymous-IP database, the Bot(VPN/Proxy) Blocker
treats a built-in list of hosting and VPN networks as VPN traffic. Tor exit
nodes come from the Tor Project's public list, refreshed hourly (set
`TOR_EXIT_LIST=off` to skip it). Outside
production you can test a country with `?vg_test_country=RU` on the verdict
request.

## How blocking works

The app embed loads `visitor-guard.js` on every storefront page. The script
asks the verdict API, served through the app proxy at
`/apps/super-visitor-guard/verdict`, whether to let the visitor in, and then
shows the page, the block message, a template, redirects, or hides sections.
Shopify signs each proxied request and passes the shopper's IP address. With
Preload Mask on, the embed hides the page until the answer arrives (at most 4
seconds; on errors the page is shown).

Checks run in this order, and the first match wins: Admin Access, all
filters off, Page White Lists, Selective Page Filtering, IP whitelist, IP
blacklist, verified search/ads crawlers (always let in), the crawler
allow/block list, Block Lists(Legacy), Referrer, URL and ISP/ASN blockers,
the Bot(VPN/Proxy) Blocker (unless the organization is whitelisted), and
the Country Blocker (countries, then states/provinces and cities).

Geolocation Redirects run last: a visitor every filter let in, from one of
a rule's countries, is sent to that rule's store address. Blocked visitors,
Admin Access devices and bots are never redirected. Content Protection is
switched on by the app embed itself, from the same app-owned metafield as
Preload Mask, so it needs no verdict call.

A crawler counts as verified when its IP reverse-resolves to the crawler's
own domain and back (for example googlebot.com), or belongs to the
crawler's own network.

After installing on the development store, open the Dashboard and use
"Open theme editor" to switch on the **Super Visitor Guard** app embed.

## Order filters

**Customer Block Lists** is a Shopify Function
(`extensions/checkout-validation`, target `cart.validations.generate.run`).
The admin page keeps one checkout validation on the shop up to date
(`validationCreate` / `validationUpdate`) and stores the rules, error message
and the $0 checkout switch in the validation's metafield
(`$app:visitor_guard.checkout`). The function stops checkout when the buyer's
email, phone, name or ZIP code matches a rule. The validation is listed in
the store's checkout settings under checkout rules. `shopify app dev` and
`shopify app deploy` build the function.

**Auto-cancel filters**, **Block Lists** and the IP Blocker's delete option
act in the `orders/create` webhook: matching orders are cancelled (refund
and restock follow the Auto Cancel Order Settings) and, for cash-on-delivery
orders, deleted when that is switched on. Blocked visitors are recognised by
the `_vg_visitor` cart attribute the storefront script adds to carts with
items. **Fraud Protect** acts in `orders/risk_assessment_changed`, cancelling
high (and optionally medium) risk orders unless the buyer's email is
whitelisted. Every action is logged on the page (`OrderFlag`).

Order and checkout data include customer details, so the app needs
**protected customer data** access (name, email, phone, address) under
API access in the Partner Dashboard before these webhooks and the function
receive those fields.

## Billing

Two plans, both through the Shopify Billing API (`app/shopify.server.ts`):

- **Pay as you go**: a usage subscription capped at $4 per 30 days. The
  first 500 storefront page views in each period are free, then every full
  100 views is charged $0.20 as a usage record.
- **Premium**: $3.99 every 30 days with a 7-day free trial, no view charges.

Every admin page checks for an active subscription and sends the merchant to
the Plans page (`/app/plans`, linked from the top bar) until one is approved.
Without a plan the storefront filters do nothing. The verdict API counts each
checked page view (Admin Access devices excluded) and charges in the
background when a view completes a block of 100 (`app/models/billing.server.ts`).
The `app_subscriptions/update` webhook keeps the plan state in step when a
subscription is cancelled or frozen outside the app.

Outside production all charges are test charges (`BILLING_TEST=true` forces
that in production too). `BILLING_DISABLED=true` skips the plan gate and
charges for local work without a Partner app.

## Email, support and housekeeping

Email goes out over SMTP when `SMTP_URL` (and `MAIL_FROM`) are set: the
Contact Us form sends to `SUPPORT_EMAIL`, and "Notify me when an order
cancelled" emails the address on the Auto Cancel Order Settings card, or
the store owner. Without SMTP the Contact Us page shows the support address
instead.

The verdict API logs and bills at most 60 page views per visitor IP per
minute for each shop; past that, visitors are still filtered but not logged
or counted. Visit records older than `VISIT_RETENTION_DAYS` (default 90) are
deleted hourly.

## Backup & Reports

- **Rules backup**: Backup & Reports exports every rule (all blockers, white
  lists, block lists and order filters) as one CSV with the columns `type`,
  `list`, `match`, `value`, `comment`, `enabled`. Import adds to the current
  rules or replaces them; each row is validated like the blocker pages do,
  and invalid rows are skipped and listed. Cells that a spreadsheet would run
  as a formula are written with a leading apostrophe.
- **Visitor records export**: Export CSV on Shop Visitor Logs downloads the
  records that match the current filters, newest first, up to 50,000 rows.
- **Weekly email summary**: when turned on, an hourly job emails each shop a
  summary of the past seven days (page views, blocked, redirected, bots, top
  blocked countries, blocks per filter, handled orders). It needs SMTP;
  `lastReportAt` is claimed before sending so several app instances never
  send the same week twice.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app through Shopify CLI |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Route typegen and TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Layout

| Path | Purpose |
| --- | --- |
| `app/components/AppFrame.tsx` | App frame: top bar, grouped sidebar, footer, shared card styles |
| `app/routes/app._index.tsx` | Dashboard: report range, blocker counts, recent visits, feature cards |
| `app/routes/app.settings.tsx` | General Settings: all filters switch, Admin Access, Preload Mask, Selective Page Filtering, Auto-Whitelist links |
| `app/routes/app.extension.tsx` | App embed status and theme editor deep link |
| `app/routes/app.country-blocker.tsx`, `app.ip-blocker.tsx`, `app.page-whitelists.tsx` | Phase 2 blocker pages |
| `app/routes/app.bot-blocker.tsx`, `app.referrer-blocker.tsx`, `app.isp-asn-blocker.tsx`, `app.url-blocker.tsx`, `app.block-lists.tsx` | Phase 3 blocker pages |
| `app/components/rule-list.tsx`, `app/models/list-rules.server.ts` | Shared list card and its loader/action plumbing |
| `app/lib/bots.ts`, `app/services/bots.server.ts` | Trusted crawler list and reverse DNS verification |
| `app/routes/app.visitor-logs.tsx`, `app.ip-lookup.tsx` | Visitor records (filters, alias, block, clean) and IP lookup |
| `app/routes/app.content-protection.tsx`, `app.geolocation-redirects.tsx` | Other Tools pages |
| `app/routes/app.customer-block-lists.tsx`, `app.auto-cancel-filters.tsx`, `app.fraud-protect.tsx` | Checkout validation and Order Filters pages |
| `extensions/checkout-validation` | Checkout validation function |
| `app/lib/customer-match.ts`, `app/lib/order-filters.ts` | Buyer matching and order decisions; pure and unit tested |
| `app/models/order-filters.server.ts`, `app/routes/webhooks.orders.*.tsx` | Order webhooks: cancel, delete, log |
| `app/routes/proxy.verdict.tsx` | Storefront verdict API (app proxy) |
| `app/lib/verdict.ts` | Decides allow or block; pure and unit tested |
| `app/lib/ip.ts` | IPv4/IPv6 addresses, CIDR blocks and ranges |
| `app/models/rules.server.ts` | Rule storage and the cached per-shop verdict config |
| `app/services/geoip.server.ts` | MaxMind location lookup |
| `app/routes/app.plans.tsx`, `app/models/billing.server.ts`, `app/lib/billing.ts` | Plans page, subscription sync and usage charges, pricing rules |
| `app/routes/app.contact.tsx`, `app.faq.tsx` | Contact Us form and FAQ |
| `app/services/mailer.server.ts`, `app/services/retention.server.ts` | SMTP email, visit log cleanup |
| `app/routes/app.backup-reports*.tsx`, `app/lib/rule-backup.ts`, `app/lib/csv.ts` | Rules backup and restore, CSV helpers |
| `app/routes/app.visitor-logs.export.tsx` | Visitor records CSV export |
| `app/services/weekly-report.server.ts`, `app/lib/weekly-report.ts` | Weekly email summary |
| `app/lib/sections.ts` | Sidebar groups, pages and their phase |
| `app/lib/theme-embed.ts` | App embed status detection and theme editor deep link |
| `app/models/shop.server.ts` | Shop lifecycle and dashboard numbers |
| `app/models/theme.server.ts` | Reads the live theme to check the app embed |
| `app/routes/webhooks.*` | Uninstall and privacy compliance webhooks |
| `extensions/visitor-guard` | Theme app embed that runs on every storefront page |
| `prisma/schema.prisma` | Data model for all phases |
