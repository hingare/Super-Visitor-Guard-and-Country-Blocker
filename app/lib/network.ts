// Networks of hosting and VPN providers. Shoppers rarely browse from a data
// centre, so when no anonymous-IP database is configured, traffic from these
// networks is treated as VPN/proxy by the Bot(VPN/Proxy) Blocker.
export const HOSTING_ASNS = new Set<number>([
  14061, // DigitalOcean
  16276, // OVH
  24940, // Hetzner
  63949, // Akamai Connected Cloud (Linode)
  20473, // Vultr (Choopa)
  9009, // M247 (many VPN exits)
  60068, // Datacamp (CDN77, VPN exits)
  51167, // Contabo
  60781, // Leaseweb NL
  30633, // Leaseweb US
  16509, // Amazon AWS
  14618, // Amazon AWS
  396982, // Google Cloud
  212238, // Datacamp
  136787, // TEFINCOM (NordVPN exits)
  62240, // Clouvider
  53667, // FranTech / BuyVM
  36352, // ColoCrossing
  46562, // Performive
  8100, // QuadraNet
  12876, // Scaleway
  45102, // Alibaba Cloud
  132203, // Tencent Cloud
  31898, // Oracle Cloud
]);

export interface NetworkInfo {
  asn: number | null;
  organization: string | null;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isHosting: boolean;
}

export const UNKNOWN_NETWORK: NetworkInfo = {
  asn: null,
  organization: null,
  isVpn: false,
  isProxy: false,
  isTor: false,
  isHosting: false,
};
