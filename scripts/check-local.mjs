/* eslint-env node */
// Checks that everything needed for local testing is in place and says what
// to fix. Run with: npm run check:local

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

// Read .env the same way Prisma does, without overriding real variables.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

let problems = 0;
const ok = (text) => console.log(`  OK    ${text}`);
const warn = (text) => console.log(`  NOTE  ${text}`);
const fail = (text) => {
  problems++;
  console.log(`  FIX   ${text}`);
};

console.log("\nSuper Visitor Guard: local setup check\n");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12)) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} is too old; install Node 22.12 or newer.`);

if (existsSync(".env")) ok(".env found");
else fail("No .env file. Copy .env.example to .env.");

const toml = existsSync("shopify.app.toml") ? readFileSync("shopify.app.toml", "utf8") : "";
if (/^client_id\s*=\s*"[^"]+"/m.test(toml)) ok("shopify.app.toml is linked to an app");
else fail('shopify.app.toml has no client_id. Run "npm run config:link" and pick or create your app.');

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set in .env.");
} else {
  const db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    ok("Database reachable");
    try {
      const rows = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
      const applied = rows[0]?.n ?? 0;
      const expected = existsSync("prisma/migrations")
        ? readdirSync("prisma/migrations").filter((name) => /^\d/.test(name)).length
        : 0;
      if (applied >= expected) ok(`Database migrations applied (${applied})`);
      else fail(`Only ${applied} of ${expected} migrations applied. Run "npx prisma migrate deploy".`);
      const shops = await db.shop.findMany({ where: { uninstalledAt: null }, select: { shopDomain: true } });
      if (shops.length > 0) ok(`Installed on: ${shops.map((shop) => shop.shopDomain).join(", ")}`);
      else warn('No shop installed yet. Run "npm run dev" and open the app in your development store.');
    } catch {
      fail('Database has no tables yet. Run "npx prisma migrate deploy".');
    }
  } catch (error) {
    fail(`Cannot connect to the database (${error.message.split("\n").map((line) => line.trim()).filter(Boolean).pop()}). Start it with "npm run services:up".`);
  } finally {
    await db.$disconnect();
  }
}

const geo = process.env.GEOIP_CITY_DB;
if (geo && existsSync(geo)) ok(`GeoIP city database: ${geo}`);
else if (geo) fail(`GEOIP_CITY_DB points at ${geo}, which does not exist.`);
else warn("GEOIP_CITY_DB is empty: real visitors get no country. Use ?vg_test_country=XX on storefront pages to test, or download GeoLite2-City.");
for (const name of ["GEOIP_ASN_DB", "GEOIP_ANON_DB"]) {
  const file = process.env[name];
  if (file && !existsSync(file)) fail(`${name} points at ${file}, which does not exist.`);
  else if (file) ok(`${name}: ${file}`);
}

if (process.env.BILLING_DISABLED === "true") ok("BILLING_DISABLED=true: no plan needed locally");
else warn("BILLING_DISABLED is not true: the app will ask you to pick a plan (test charges, no real money).");

if (!process.env.SMTP_URL) {
  warn('SMTP_URL is empty: emails are not sent. For local testing use SMTP_URL=smtp://localhost:1025 with "npm run services:up".');
} else {
  try {
    await nodemailer.createTransport(process.env.SMTP_URL).verify();
    ok(`SMTP reachable (${process.env.SMTP_URL.replace(/\/\/[^@]*@/, "//***@")})`);
    if (process.env.SMTP_URL.includes("localhost:1025")) ok("Emails land in Mailpit: http://localhost:8025");
  } catch (error) {
    fail(`SMTP_URL is set but not reachable (${error.message}). Is Mailpit running? "npm run services:up".`);
  }
}

console.log(problems === 0 ? "\nAll set. Next: npm run dev\n" : `\n${problems} thing(s) to fix above.\n`);
process.exitCode = problems === 0 ? 0 : 1;
