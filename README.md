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
| 3 | Bot(VPN/Proxy) Blocker with organization and crawler lists, Referrer, ISP/ASN and URL blockers, Block Lists(Legacy) | Next |
| 4 | Shop Visitor Logs (visitor ids, aliases, quick block, filters), IP Address Lookup | |
| 5 | Content Protection, Geolocation Redirects | |
| 6 | Customer Block Lists (checkout validation function), Fraud Protect, Auto-cancel filters, order cancel/refund/delete settings | |
| 7 | Billing | |
| 8 | Contact Us, FAQ, hardening and App Store submission | |

## Local development

Requirements: Node 22.12+, PostgreSQL 14+, Shopify CLI, a Partner account and
a development store.

```shell
cp .env.example .env          # set DATABASE_URL and GEOIP_CITY_DB
npm install
npx prisma migrate deploy
npm run config:link           # connect to your app in the Partner Dashboard
npm run dev                   # shopify app dev
```

Visitor locations come from a MaxMind GeoLite2-City (free, needs a MaxMind
account) or GeoIP2-City database. Download the `.mmdb` file and point
`GEOIP_CITY_DB` at it; the file is reloaded when it changes. Without it the
Country Blocker cannot locate visitors and lets everyone through. Outside
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
blacklist, Country Blocker (countries, then states/provinces and cities).

After installing on the development store, open the Dashboard and use
"Open theme editor" to switch on the **Super Visitor Guard** app embed.

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
| `app/routes/proxy.verdict.tsx` | Storefront verdict API (app proxy) |
| `app/lib/verdict.ts` | Decides allow or block; pure and unit tested |
| `app/lib/ip.ts` | IPv4/IPv6 addresses, CIDR blocks and ranges |
| `app/models/rules.server.ts` | Rule storage and the cached per-shop verdict config |
| `app/services/geoip.server.ts` | MaxMind location lookup |
| `app/routes/app.$section.tsx` | Placeholder for pages built in later phases |
| `app/lib/sections.ts` | Sidebar groups, pages and their phase |
| `app/lib/theme-embed.ts` | App embed status detection and theme editor deep link |
| `app/models/shop.server.ts` | Shop lifecycle and dashboard numbers |
| `app/models/theme.server.ts` | Reads the live theme to check the app embed |
| `app/routes/webhooks.*` | Uninstall and privacy compliance webhooks |
| `extensions/visitor-guard` | Theme app embed that runs on every storefront page |
| `prisma/schema.prisma` | Data model for all phases |
