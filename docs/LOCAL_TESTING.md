# লোকাল কম্পিউটারে পুরো app চালানো ও টেস্ট করার গাইড

এই গাইড অনুসরণ করলে আপনার নিজের কম্পিউটারে Super Visitor Guard চালিয়ে
প্রতিটা page আর feature হাতে-কলমে পরীক্ষা করতে পারবেন। Deploy লাগবে না।

> **একটা জরুরি কথা:** Shopify app সাধারণ website-এর মতো শুধু
> `http://localhost:3000` খুলে দেখা যায় না। Admin page-গুলো সবসময় Shopify
> admin-এর ভেতরে খোলে। `npm run dev` (Shopify CLI) আপনার কম্পিউটারে app
> চালায় আর একটা নিরাপদ tunnel দিয়ে সেটা আপনার **development store**-এর
> admin-এ জুড়ে দেয়। তাই app চলে আপনার localhost-এই, কিন্তু আপনি সেটা দেখবেন
> development store-এর admin থেকে। এতে কোনো খরচ নেই।

---

## ১. একবারই যা যা লাগবে

| জিনিস | কোথা থেকে | কেন |
| --- | --- | --- |
| Node.js 22.12 বা নতুন | https://nodejs.org (LTS) | app চালাতে |
| Git | https://git-scm.com | repo নামাতে |
| Docker Desktop | https://www.docker.com/products/docker-desktop | PostgreSQL database আর লোকাল email inbox (Mailpit) চালাতে |
| Shopify CLI | `npm install -g @shopify/cli` | `npm run dev` চালাতে |
| Shopify Partner account | https://partners.shopify.com | app তৈরি ও development store |
| একটা development store | Partner Dashboard → Stores → Add store → Development store | app install করে টেস্ট করার store |

Development store বানানোর সময় "Start with test data" বেছে নিলে product আর
order আগে থেকেই থাকবে।

Docker ব্যবহার করতে না চাইলে নিজে PostgreSQL 14+ install করে
`app` নামের user/password/database বানালেও চলবে। তখন email দেখার জন্য
Mailpit আলাদা করে install করতে হবে।

---

## ২. প্রথমবার setup (একবারই)

PowerShell বা Terminal খুলে:

```shell
git clone https://github.com/hingare/Super-Visitor-Guard-and-Country-Blocker.git
cd Super-Visitor-Guard-and-Country-Blocker
npm install
copy .env.example .env        # Mac/Linux হলে: cp .env.example .env
npm run services:up           # Docker-এ PostgreSQL + Mailpit চালু হবে
npx prisma migrate deploy     # database-এ table তৈরি হবে
npm run config:link           # Partner account-এ login, "Create new app" বেছে নিন
```

`config:link` চালালে Shopify CLI জিজ্ঞেস করবে কোন app-এর সাথে যুক্ত করবেন।
নতুন app বানিয়ে নিন (নাম যেমন "Super Visitor Guard Dev")। এতে
`shopify.app.toml`-এ `client_id` বসে যাবে।

### Protected customer data (order-এর feature-এর জন্য দরকার)

Partner Dashboard → Apps → আপনার app → **API access** → "Protected customer
data access"-এ গিয়ে name, email, phone, address বেছে নিন এবং কারণ লিখুন।
Development store-এ টেস্ট করার জন্য Shopify-এর review লাগে না। এটা না করলে
order webhook (Fraud Protect, Auto-cancel, COD delete) কাজ করবে না।

### সব ঠিক আছে কিনা দেখুন

```shell
npm run check:local
```

এটা Node version, `.env`, database, migration, GeoIP file, email (SMTP) আর app
link পরীক্ষা করে। কোথাও **FIX** লেখা থাকলে সেটা ঠিক করে আবার চালান।
**NOTE** মানে সেটা ঐচ্ছিক।

---

## ৩. প্রতিবার app চালানো

```shell
npm run services:up     # Docker আগে থেকে চালু না থাকলে
npm run dev
```

Terminal-এ `Press p to open` এলে **p** চাপুন। Browser-এ আপনার development
store খুলবে এবং app install করতে বলবে। Install করলেই app-এর Dashboard দেখা
যাবে। পরের বার শুধু store admin → Apps → Super Visitor Guard খুললেই হবে, যতক্ষণ
`npm run dev` চলছে।

`.env`-এ `BILLING_DISABLED=true` থাকায় লোকালে কোনো plan বাছতে হবে না।
Plans page টেস্ট করতে চাইলে নিচের ৮ নম্বর অংশ দেখুন।

### App embed চালু করুন (storefront-এর সব feature-এর জন্য বাধ্যতামূলক)

App-এর বাঁ দিকের menu → **App extension** → "Auto enable" বাটন চাপুন → theme
editor খুলবে → **Save** চাপুন। Dashboard-এ embed-এর অবস্থা "On" দেখাবে।

### Demo data বসান (ঐচ্ছিক, কিন্তু খুব কাজের)

App একবার খোলার পরে (তাতে database-এ shop তৈরি হয়), নতুন terminal-এ:

```shell
npm run seed:demo
```

এটা গত ৭ দিনের ৪০০টা visit, ৪০ জন visitor, প্রতিটা blocker-এ rule আর ৬টা
handle-করা order বসিয়ে দেয়। এতে Dashboard, Visitor Logs, Fraud Protect সহ
সব page-এ কিছু না কিছু দেখা যাবে। পরে সরাতে চাইলে:

```shell
npm run seed:demo -- --clear
```

> Demo rule-গুলো আসল rule-এর মতোই কাজ করে। যেমন RU আর CN country block
> হয়ে যাবে। নতুন rule কাজ শুরু করতে সর্বোচ্চ এক মিনিট লাগতে পারে।

---

## ৪. Storefront-এ block টেস্ট করার কৌশল

### নিজের visit যেন block না হয়

Settings-এর **Admin Access** যে device-এ চালু, সেখানে কোনো filter কাজ করে না।
এটা ইচ্ছাকৃত, যাতে store owner নিজে কখনো block না হন। তাই block টেস্ট করার
সময় **Incognito/Private window** ব্যবহার করুন, বা সেই device-এ Admin Access বন্ধ
রাখুন।

Development store-এ password থাকলে storefront খোলার সময় password দিন।
Password-টা পাবেন Online Store → Preferences-এ।

### অন্য দেশ বা IP থেকে আসার ভান করা (test parameter)

লোকালে (`NODE_ENV` production না হলে) storefront-এর যেকোনো page-এর URL-এর
শেষে এগুলো যোগ করলে app ধরে নেবে আপনি সেখান থেকে এসেছেন। Production-এ
এগুলো উপেক্ষা করা হয়।

| Parameter | উদাহরণ | কী টেস্ট হয় |
| --- | --- | --- |
| `vg_test_country` | `?vg_test_country=RU` | Country Blocker, Geolocation Redirects |
| `vg_test_ip` | `?vg_test_ip=203.0.113.66` | IP Blocker (blacklist/whitelist/range) |
| `vg_test_vpn` | `?vg_test_vpn=1` | Bot (VPN/Proxy) Blocker |
| `vg_test_org` | `?vg_test_org=Bad Hosting Ltd` | Organization whitelist, ISP Blocker |
| `vg_test_asn` | `?vg_test_asn=64500` | ASN Blocker |

একাধিক একসাথে: `?vg_test_country=US&vg_test_ip=198.51.100.10`

Parameter শুধু সেই page-এ কাজ করে। অন্য page-এ গেলে আবার যোগ করতে হবে।

### আসল দেশ চিনতে (ঐচ্ছিক)

Test parameter ছাড়াই আসল visitor-এর দেশ জানতে MaxMind-এর বিনামূল্যের
**GeoLite2-City** database লাগবে। https://www.maxmind.com-এ free account খুলে
`GeoLite2-City.mmdb` (আর চাইলে `GeoLite2-ASN.mmdb`) নামান, তারপর `.env`-এ লিখুন:

```
GEOIP_CITY_DB=C:\geoip\GeoLite2-City.mmdb
GEOIP_ASN_DB=C:\geoip\GeoLite2-ASN.mmdb
```

### Email দেখা

App যত email পাঠায় (Contact Us, order cancel-এর notice, weekly summary), সব
Mailpit ধরে রাখে। দেখতে browser-এ খুলুন: **http://localhost:8025**। কোনো আসল
email কোথাও যায় না।

---

## ৫. Page ধরে ধরে টেস্ট checklist

প্রতিটা লাইনে আগে কী করবেন, তারপর কী দেখা উচিত।

### Dashboard
- [ ] Report Range বদলান (24 hours / 7 days ...) → stat card-এর সংখ্যা বদলায়
- [ ] Recent visit records-এ শেষ visit-গুলো দেখা যায়, "View all" চাপলে Visitor Logs খোলে
- [ ] Feature card-এর বাটনগুলো ঠিক page-এ নিয়ে যায়

### Shop Visitor Logs
- [ ] Incognito-তে storefront-এর কয়েকটা page খুলুন → Reload চাপলে নতুন record আসে
- [ ] IP / Country দিয়ে search, "Blocked/Redirected only", "Show Bot Visits Only" ফিল্টার কাজ করে
- [ ] ••• menu → Set alias, Block Visitor, Retrieve IP information
- [ ] **Export CSV** → ফিল্টার করা record-এর ফাইল নামে
- [ ] Clean Records → সব record মুছে যায় (আগে confirm চায়)

### General Settings
- [ ] Enable/Disable All Filters বন্ধ করুন → কোনো block হয় না; আবার চালু করুন
- [ ] Admin Access: "Enable Admin Access on this device" → সেই browser আর block হয় না
- [ ] Invitation Link বানান → অন্য browser-এ খুললে সেটাও admin হয়ে যায়
- [ ] Preload Mask চালু করুন → storefront page লোড হওয়ার সময় সাদা পর্দা, check শেষে content দেখা যায়
- [ ] Selective Page Filtering-এ `/products/...` যোগ করুন → শুধু সেই page-এ filter চলে
- [ ] Auto-Whitelist Link বানান → incognito-তে খুলুন → আপনার IP whitelist-এ যোগ হয়ে home page-এ যায়

### Page White Lists
- [ ] `/pages/contact` যোগ করুন → country block থাকলেও সেই page খোলে

### Country Blocker
- [ ] Blacklist mode-এ RU যোগ করুন → `?vg_test_country=RU` দিয়ে storefront → block page
- [ ] Whitelist mode-এ শুধু BD রাখুন → `?vg_test_country=US` → block, `?vg_test_country=BD` → খোলে
- [ ] Block by States/Provinces/Cities চালু করে একটা city যোগ করুন (এর জন্য GeoLite2-City লাগবে)
- [ ] "How would you like to handle blocked visitors" এর ৪টা option একে একে বেছে Save করুন:
  custom message, redirect, template, Show/Hide page section

### IP Blocker
- [ ] Blacklist-এ একটা IP, একটা range (`203.0.113.0/24`) আর Bulk Upload দিন
- [ ] `?vg_test_ip=203.0.113.5` → block; Whitelist-এ সেটা দিলে country block-এর চেয়েও আগে allow হয়
- [ ] Edit আর delete কাজ করে, pagination-এ প্রথম/শেষ page বাটন আছে

### Bot (VPN/Proxy) Blocker
- [ ] চালু করুন → `?vg_test_vpn=1` → block
- [ ] "Add Widely-Used Organizations" → iCloud Private Relay ইত্যাদি যোগ হয়
- [ ] `?vg_test_vpn=1&vg_test_org=Cloudflare` → organization whitelist-এর জন্য allow
- [ ] Web crawler list-এ `ahrefsbot` রাখুন; browser-এর User-Agent বদলে টেস্ট করা যায় (DevTools → Network conditions)

### Customer Block Lists (checkout)
- [ ] Checkout Validation চালু করুন, একটা email block rule দিন
- [ ] Storefront-এ product কিনে checkout-এ সেই email দিন → আপনার error message দেখায়, order হয় না
- [ ] Prevent $0 Checkout চালু করে ফ্রি order টেস্ট করুন

### Block Lists (Legacy)
- [ ] Visitor Logs থেকে একজন visitor block করুন → এখানে দেখা যায়, সেই browser-এ store block
- [ ] Auto Cancel Order Settings-এর তিনটা toggle

### Referrer / ISP-ASN / URL Blocker
- [ ] Referrer: অন্য কোনো site-এর link থেকে store-এ আসুন (বা demo rule `spam-traffic.example`)
- [ ] ISP/ASN: `?vg_test_asn=64500` (demo rule) → block
- [ ] URL: `?utm_source=spam` যোগ করুন (demo rule) → block

### Fraud Protect
- [ ] Fraud Protect চালু করুন, High Risk cancel "Activate"
- [ ] **Create Test Order** চাপুন → কয়েক সেকেন্ড পরে Reload → Filtered Orders-এ order-টা "Cancelled" দেখায়, Shopify admin-এর Orders-এও cancel দেখায়
- [ ] Whitelist-এ `fraud-test@example.com` দিয়ে আবার → এবার "Skipped"
- [ ] "Notify me when an order cancelled" চালু থাকলে Mailpit-এ email আসে

### Auto-cancel filters
- [ ] Filter-এ নিজের একটা email দিন → storefront থেকে সেই email দিয়ে order দিন (Bogus Gateway, নিচে দেখুন) → order cancel হয়

### Content Protection
- [ ] চালু করুন → incognito-তে storefront-এ right-click, text select, Ctrl+C, F12 কাজ করে না

### Geolocation Redirects
- [ ] GB → `https://example.com` rule দিন → `?vg_test_country=GB` → redirect

### IP Address Lookup
- [ ] যেকোনো IP লিখে Search → দেশ, provider, VPN-এর তথ্য দেখায় (GeoLite2 লাগবে)

### Backup & Reports
- [ ] Export rules → CSV নামে; একটা rule মুছে Import (Add) → ফিরে আসে
- [ ] Import (Replace) → আগে confirm চায়, তারপর ফাইলের rule-গুলোই থাকে
- [ ] Weekly summary-তে email দিয়ে চালু করুন → "Send a summary now" → Mailpit-এ email

### Contact Us / FAQ
- [ ] Form পাঠান → Mailpit-এ support email আসে (`.env`-এ `SUPPORT_EMAIL` দিন)
- [ ] FAQ-এর প্রশ্নগুলো খোলে/বন্ধ হয়

---

## ৬. Storefront থেকে টেস্ট order দেওয়া

Store admin → Settings → Payments → "Bogus Gateway" (test mode) চালু করুন।
Checkout-এ card number **1**, যেকোনো ভবিষ্যৎ মেয়াদ, যেকোনো CVV দিলে সফল order হয়।

Cash on Delivery টেস্ট করতে Payments → Manual payment methods → Cash on
Delivery চালু করুন।

---

## ৭. Webhook আর background কাজ

`npm run dev` চলাকালীন order webhook (orders/create, risk assessment) আপনার
কম্পিউটারে পৌঁছায়, আর terminal-এ log দেখা যায়। আসল order দিয়ে টেস্ট করাই
সবচেয়ে নির্ভরযোগ্য (৬ নম্বর অংশ), আর Fraud Protect-এর জন্য "Create Test
Order" বাটন আছে।

---

## ৮. Plans (billing) page টেস্ট

`.env`-এ `BILLING_DISABLED=true` লাইনটা মুছে বা `false` করে `npm run dev`
আবার চালান। App খুললে Plans page আসবে। Development store-এ সব charge
**test charge**, কোনো টাকা কাটে না। Plan বেছে approve করলে app খুলে যায়। শেষে
আবার `BILLING_DISABLED=true` করে দিন।

---

## ৯. সমস্যা হলে

| সমস্যা | সমাধান |
| --- | --- |
| `Can't reach database server` | Docker Desktop চালু করুন, তারপর `npm run services:up` |
| Storefront-এ কিছুই block হয় না | App embed চালু ও Save করা আছে? Admin Access-এর browser নয় তো? Incognito ব্যবহার করুন। General Settings-এ filter চালু? |
| দেশ দেখায় না / Unknown | GeoLite2 নেই। `vg_test_country` ব্যবহার করুন বা `GEOIP_CITY_DB` দিন |
| Email আসে না | `npm run check:local` চালান। Mailpit চলছে? http://localhost:8025 |
| Order webhook আসে না | Protected customer data access বেছে নিয়েছেন? `npm run dev` চলছে? |
| নতুন rule সাথে সাথে কাজ করে না | এক মিনিট অপেক্ষা করুন (cache) |
| সব নতুন করে শুরু করতে চান | `npm run services:reset` (database আর email সব মুছে যায়), তারপর `npm run services:up` আর `npx prisma migrate deploy`, তারপর app আবার খুলুন |

---

## ১০. কাজ শেষে বন্ধ করা

Terminal-এ `Ctrl+C` চাপলে app বন্ধ হবে। Database আর Mailpit বন্ধ করতে:

```shell
npm run services:down
```

Data মোছে না, পরের বার `services:up` করলে সব আগের মতো থাকবে।
