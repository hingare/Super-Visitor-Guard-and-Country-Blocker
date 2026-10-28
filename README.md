# Visitor Guard (working name)

A Shopify app that blocks unwanted visitors and orders: country / state / city /
IP / VPN / bot / ISP / referrer blocking, checkout validation, fraud order
handling, content protection, geo redirects and a visit log.

Built on Shopify's official React Router app template with Polaris web
components, Prisma and PostgreSQL.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: data model, sidebar layout, Dashboard, General Settings, App extension page, app embed, webhooks | Done |
| 2 | Verdict engine and storefront script; Country Blocker, IP Blocker, Page White Lists; per-blocker block handling; Admin Access, Auto-Whitelist, Preload Mask and Selective Page Filtering on the storefront | Next |
| 3 | Bot(VPN/Proxy) Blocker with organization and crawler lists, Referrer, ISP/ASN and URL blockers, Block Lists(Legacy) | |
| 4 | Shop Visitor Logs (visitor ids, aliases, quick block, filters), IP Address Lookup | |
| 5 | Content Protection, Geolocation Redirects | |
| 6 | Customer Block Lists (checkout validation function), Fraud Protect, Auto-cancel filters, order cancel/refund/delete settings | |
| 7 | Billing | |
| 8 | Contact Us, FAQ, hardening and App Store submission | |

## Local development

Requirements: Node 22.12+, PostgreSQL 14+, Shopify CLI, a Partner account and
a development store.

```shell
cp .env.example .env          # set DATABASE_URL
npm install
npx prisma migrate deploy
npm run config:link           # connect to your app in the Partner Dashboard
npm run dev                   # shopify app dev
```

After installing on the development store, open the Dashboard and use
"Open theme editor" to switch on the **Visitor guard** app embed.

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
| `app/routes/app.$section.tsx` | Placeholder for pages built in later phases |
| `app/lib/sections.ts` | Sidebar groups, pages and their phase |
| `app/lib/theme-embed.ts` | App embed status detection and theme editor deep link |
| `app/models/shop.server.ts` | Shop lifecycle and dashboard numbers |
| `app/models/theme.server.ts` | Reads the live theme to check the app embed |
| `app/routes/webhooks.*` | Uninstall and privacy compliance webhooks |
| `extensions/visitor-guard` | Theme app embed that runs on every storefront page |
| `prisma/schema.prisma` | Data model for all phases |
