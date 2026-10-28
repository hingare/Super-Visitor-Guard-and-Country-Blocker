# Visitor Guard (working name)

A Shopify app that blocks unwanted visitors and orders: country / state / city /
IP / VPN / bot / ISP / referrer blocking, checkout validation, fraud order
handling, content protection, geo redirects and a visit log.

Built on Shopify's official React Router app template with Polaris web
components, Prisma and PostgreSQL.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: data model, navigation, Dashboard, Settings, app embed, webhooks | Done |
| 2 | Verdict engine, Country / IP blocking, whitelist, redirects, blocked page | Next |
| 3 | Bot, VPN, proxy, data center, ISP / ASN, referrer, URL blocking | |
| 4 | Visit log and dashboard analytics | |
| 5 | Content protection | |
| 6 | Checkout validation function and fraud order handling | |
| 7 | Billing: pay as you go and Premium | |
| 8 | Hardening and App Store submission | |

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
| `app/routes/app._index.tsx` | Dashboard: protection toggle, app embed status, visit stats |
| `app/routes/app.settings.tsx` | General settings |
| `app/routes/app.$section.tsx` | Placeholder for pages built in later phases |
| `app/lib/sections.ts` | Navigation pages and their phase |
| `app/lib/theme-embed.ts` | App embed status detection and theme editor deep link |
| `app/models/shop.server.ts` | Shop lifecycle and visit stats |
| `app/routes/webhooks.*` | Uninstall and privacy compliance webhooks |
| `extensions/visitor-guard` | Theme app embed that runs on every storefront page |
| `prisma/schema.prisma` | Data model for all phases |
