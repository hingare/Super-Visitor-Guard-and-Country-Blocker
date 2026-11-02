/* eslint-env node */
// Fills a development shop with demo data so every admin page has something
// to show: a week of visitor records, rules on each blocker, and handled
// orders. Every demo row is marked so it can be removed again.
//
//   npm run seed:demo                       (the only installed shop)
//   npm run seed:demo -- my-store.myshopify.com
//   npm run seed:demo -- --clear            (remove the demo data)
//
// Open the app once in your development store first: that creates the shop.

import { PrismaClient } from "@prisma/client";

const DEMO_TAG = "Demo data";
const DEMO_URL_FLAG = "vg_demo=1";
const DEMO_ORDER_PREFIX = "demo-order-";
// Demo visitor ids use their own range so they never clash with real ones.
const DEMO_CODE_BASE = 900_000_000;

const args = process.argv.slice(2);
const clear = args.includes("--clear");
const shopArg = args.find((arg) => !arg.startsWith("--"));

const db = new PrismaClient();

async function findShop() {
  if (shopArg) {
    const domain = shopArg.includes(".") ? shopArg : `${shopArg}.myshopify.com`;
    const shop = await db.shop.findUnique({ where: { shopDomain: domain } });
    if (!shop) throw new Error(`No shop ${domain} in the database. Open the app in that store first.`);
    return shop;
  }
  const shops = await db.shop.findMany({ where: { uninstalledAt: null } });
  if (shops.length === 0) {
    throw new Error("No shop in the database yet. Run `npm run dev`, open the app in your development store, then run this again.");
  }
  if (shops.length > 1) {
    throw new Error(`Several shops found (${shops.map((s) => s.shopDomain).join(", ")}). Name one: npm run seed:demo -- <shop>`);
  }
  return shops[0];
}

async function clearDemo(shopId) {
  const [visits, visitors, rules, orders, redirects] = await db.$transaction([
    db.visit.deleteMany({ where: { shopId, url: { contains: DEMO_URL_FLAG } } }),
    db.visitor.deleteMany({ where: { shopId, alias: { startsWith: "Demo " } } }),
    db.rule.deleteMany({ where: { shopId, comment: DEMO_TAG } }),
    db.orderFlag.deleteMany({ where: { shopId, orderId: { startsWith: DEMO_ORDER_PREFIX } } }),
    db.geoRedirect.deleteMany({ where: { shopId, targetUrl: { contains: DEMO_URL_FLAG } } }),
  ]);
  return { visits: visits.count, visitors: visitors.count, rules: rules.count, orders: orders.count, redirects: redirects.count };
}

// A small deterministic random generator, so every run looks the same.
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (items) => items[Math.floor(random() * items.length)];

const PLACES = [
  { country: "US", countryName: "United States", region: "CA", city: "Los Angeles", ip: "198.51.100." },
  { country: "US", countryName: "United States", region: "NY", city: "New York", ip: "198.51.101." },
  { country: "BD", countryName: "Bangladesh", region: "C", city: "Dhaka", ip: "203.0.112." },
  { country: "GB", countryName: "United Kingdom", region: "ENG", city: "London", ip: "192.0.2." },
  { country: "DE", countryName: "Germany", region: "BE", city: "Berlin", ip: "198.18.0." },
  { country: "IN", countryName: "India", region: "MH", city: "Mumbai", ip: "198.18.1." },
  { country: "RU", countryName: "Russia", region: "MOW", city: "Moscow", ip: "198.18.2." },
  { country: "CN", countryName: "China", region: "BJ", city: "Beijing", ip: "198.18.3." },
];
const PAGES = [
  ["index", "/"],
  ["product", "/products/classic-tee"],
  ["collection", "/collections/all"],
  ["cart", "/cart"],
  ["search", "/search?q=shirt"],
  ["page", "/pages/about"],
];
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const BOTS = [
  { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", lowRisk: true },
  { ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", lowRisk: false },
  { ua: "python-requests/2.31", lowRisk: false },
];

async function seedDemo(shop) {
  const shopId = shop.id;
  const host = shop.shopDomain;

  // Rules on every blocker.
  const rules = [
    ["COUNTRY", "BLACKLIST", "EXACT", "RU"],
    ["COUNTRY", "BLACKLIST", "EXACT", "CN"],
    ["STATE", "BLACKLIST", "EXACT", "US:texas"],
    ["IP", "BLACKLIST", "EXACT", "203.0.113.66"],
    ["IP_RANGE", "BLACKLIST", "EXACT", "203.0.113.128/25"],
    ["IP", "WHITELIST", "EXACT", "198.51.100.10"],
    ["ORGANIZATION", "WHITELIST", "PARTIAL", "icloud private relay"],
    ["CRAWLER", "BLACKLIST", "PARTIAL", "ahrefsbot"],
    ["REFERRER", "BLACKLIST", "EXACT", "spam-traffic.example"],
    ["ISP", "BLACKLIST", "PARTIAL", "bad hosting ltd"],
    ["ASN", "BLACKLIST", "EXACT", "64500"],
    ["URL", "BLACKLIST", "PARTIAL", "utm_source=spam"],
    ["PAGE_WHITELIST", "WHITELIST", "EXACT", "/pages/contact"],
    ["CUSTOMER_EMAIL", "BLACKLIST", "EXACT", "fraudster@example.com"],
    ["CUSTOMER_PHONE", "BLACKLIST", "EXACT", "15550100999"],
    ["AUTO_CANCEL_EMAIL", "BLACKLIST", "PARTIAL", "@mailinator.com"],
    ["FRAUD_WHITELIST_EMAIL", "WHITELIST", "EXACT", "vip-buyer@example.com"],
  ];
  const ruleResult = await db.rule.createMany({
    data: rules.map(([type, list, matchType, value]) => ({ shopId, type, list, matchType, value, comment: DEMO_TAG })),
    skipDuplicates: true,
  });

  // Demo visitors and a week of visits.
  const visitors = [];
  for (let i = 0; i < 40; i++) {
    const code = `CT-${DEMO_CODE_BASE + i}`;
    visitors.push(
      await db.visitor.upsert({
        where: { shopId_code: { shopId, code } },
        create: { shopId, code, alias: i < 3 ? `Demo shopper ${i + 1}` : `Demo ${i + 1}` },
        update: {},
      }),
    );
  }

  const now = Date.now();
  const visits = [];
  for (let i = 0; i < 400; i++) {
    const place = pick(PLACES);
    const [pageType, path] = pick(PAGES);
    const visitor = pick(visitors);
    const bot = random() < 0.12 ? pick(BOTS) : null;
    const vpn = !bot && random() < 0.06;
    const ip = `${place.ip}${1 + Math.floor(random() * 250)}`;
    let verdict = "ALLOWED";
    let blocker = null;
    let reason = null;
    const roll = random();

    if (place.country === "RU" || place.country === "CN") {
      verdict = "BLOCKED";
      blocker = "COUNTRY";
      reason = `Country: ${place.country}`;
    } else if (bot && !bot.lowRisk) {
      verdict = "BLOCKED";
      blocker = "BOT_VPN";
      reason = "Bot";
    } else if (vpn) {
      verdict = "BLOCKED";
      blocker = "BOT_VPN";
      reason = "VPN";
    } else if (roll < 0.03) {
      verdict = "BLOCKED";
      blocker = "IP";
      reason = "IP: 203.0.113.66";
    } else if (roll < 0.06) {
      verdict = "BLOCKED";
      blocker = "REFERRER";
      reason = "Referrer: spam-traffic.example";
    } else if (roll < 0.08) {
      verdict = "REDIRECTED";
      reason = "Geolocation redirect";
    }

    visits.push({
      shopId,
      visitorId: visitor.id,
      createdAt: new Date(now - Math.floor(random() * 7 * 24 * 3600 * 1000)),
      ip: blocker === "IP" ? "203.0.113.66" : ip,
      country: place.country,
      countryName: place.countryName,
      region: place.region,
      city: place.city,
      isp: vpn ? "Demo VPN Provider" : "Demo Telecom",
      organization: vpn ? "Demo VPN Provider" : "Demo Telecom",
      asn: vpn ? 64501 : 64496,
      isVpn: vpn,
      isBot: Boolean(bot),
      isLowRiskBot: Boolean(bot?.lowRisk),
      userAgent: bot ? bot.ua : BROWSER,
      pageType,
      url: `https://${host}${path}${path.includes("?") ? "&" : "?"}${DEMO_URL_FLAG}`,
      referrer: blocker === "REFERRER" ? "https://spam-traffic.example/" : random() < 0.3 ? "https://www.google.com/" : null,
      verdict,
      blocker,
      reason,
    });
  }
  const visitResult = await db.visit.createMany({ data: visits });

  // Orders handled by Fraud Protect and the auto-cancel filters.
  const orders = [
    ["FRAUD_PROTECT", "HIGH", "CANCELLED", "Shopify marked the order as high risk", "risky1@example.com"],
    ["FRAUD_PROTECT", "MEDIUM", "SKIPPED", "Risk level medium; no action set", "buyer2@example.com"],
    ["FRAUD_PROTECT", "LOW", "SKIPPED", "Risk level low; no action set", "buyer3@example.com"],
    ["FRAUD_PROTECT", "HIGH", "SKIPPED", "Buyer email is on the Fraud Protect whitelist", "vip-buyer@example.com"],
    ["AUTO_CANCEL", null, "CANCELLED", "Email matches @mailinator.com", "temp@mailinator.com"],
    ["BLOCK_LIST", null, "DELETED", "Order placed by blocked visitor CT-900000005 (cash on delivery)", "cod@example.com"],
  ];
  let orderCount = 0;
  for (const [index, [source, riskLevel, actionTaken, reason, email]] of orders.entries()) {
    const orderId = `${DEMO_ORDER_PREFIX}${index + 1}`;
    await db.orderFlag.upsert({
      where: { shopId_orderId: { shopId, orderId } },
      create: {
        shopId,
        orderId,
        orderName: `#D${1001 + index}`,
        email,
        riskLevel,
        source,
        reason,
        actionTaken,
        createdAt: new Date(now - index * 3 * 3600 * 1000),
      },
      update: {},
    });
    orderCount++;
  }

  const existingRedirect = await db.geoRedirect.findFirst({ where: { shopId, targetUrl: { contains: DEMO_URL_FLAG } } });
  if (!existingRedirect) {
    await db.geoRedirect.create({
      data: { shopId, countries: ["GB"], targetUrl: `https://uk.example.com/?${DEMO_URL_FLAG}`, enabled: false },
    });
  }

  return { rules: ruleResult.count, visitors: visitors.length, visits: visitResult.count, orders: orderCount };
}

try {
  const shop = await findShop();
  if (clear) {
    const removed = await clearDemo(shop.id);
    console.log(`Removed demo data from ${shop.shopDomain}:`, removed);
  } else {
    const added = await seedDemo(shop);
    console.log(`Added demo data to ${shop.shopDomain}:`, added);
    console.log("Remove it again with: npm run seed:demo -- --clear");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
