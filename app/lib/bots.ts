import { isbot } from "isbot";

// Search, ads and social crawlers that are always let in once verified, so
// blocking never hurts SEO or ad reviews. A crawler is verified when its IP
// reverse-resolves to one of its domains and that name resolves back to the
// same IP, or when the IP belongs to one of its own networks (ASN). Shared
// cloud networks such as Google's or Microsoft's are never used for this,
// since anyone can rent a server there.

export interface TrustedBot {
  name: string;
  pattern: RegExp;
  domains: string[];
  asns: number[];
}

export const TRUSTED_BOTS: TrustedBot[] = [
  { name: "Googlebot", pattern: /googlebot|google-inspectiontool|storebot-google|googleother/i, domains: ["googlebot.com", "google.com"], asns: [] },
  { name: "Google Ads", pattern: /adsbot-google|mediapartners-google|google-adwords/i, domains: ["google.com", "googlebot.com"], asns: [] },
  { name: "Bingbot", pattern: /bingbot|adidxbot|bingpreview|msnbot/i, domains: ["search.msn.com"], asns: [] },
  { name: "Applebot", pattern: /applebot/i, domains: ["applebot.apple.com"], asns: [714, 6185] },
  { name: "YandexBot", pattern: /yandex(bot|images|mobilebot|metrika)/i, domains: ["yandex.ru", "yandex.net", "yandex.com"], asns: [13238] },
  { name: "Baiduspider", pattern: /baiduspider/i, domains: ["baidu.com", "baidu.jp"], asns: [] },
  { name: "DuckDuckBot", pattern: /duckduckbot|duckassistbot/i, domains: ["duckduckgo.com"], asns: [] },
  { name: "Facebook", pattern: /facebookexternalhit|facebookcatalog|meta-externalagent/i, domains: ["facebook.com", "fbsv.net"], asns: [32934] },
  { name: "Pinterestbot", pattern: /pinterest(bot)?\//i, domains: ["pinterest.com"], asns: [] },
  { name: "Twitterbot", pattern: /twitterbot/i, domains: ["twttr.com", "twitter.com"], asns: [13414] },
  { name: "LinkedInBot", pattern: /linkedinbot/i, domains: ["linkedin.com"], asns: [14413] },
];

export interface UserAgentInfo {
  isBot: boolean;
  // The trusted crawler this user agent claims to be, before verification.
  claimed: TrustedBot | null;
}

export function classifyUserAgent(userAgent: string | null): UserAgentInfo {
  if (!userAgent) return { isBot: false, claimed: null };
  const claimed = TRUSTED_BOTS.find((bot) => bot.pattern.test(userAgent)) ?? null;
  return { isBot: claimed !== null || isbot(userAgent), claimed };
}

export function hostMatchesDomains(host: string, domains: string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return domains.some((domain) => name === domain || name.endsWith(`.${domain}`));
}
