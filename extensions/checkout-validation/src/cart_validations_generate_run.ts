import {
  buildIdentity,
  findCustomerMatch,
  type CustomerRule,
} from "../../../app/lib/customer-match";

// Runs in Shopify checkout. The admin page (Customer Block Lists) writes the
// config below to the validation's metafield; when any rule matches the
// buyer, or the total is zero and that is not allowed, checkout stops with
// the merchant's message.

export interface CheckoutValidationConfig {
  message: string;
  preventZero: boolean;
  rules: CustomerRule[];
}

interface Name {
  firstName?: string | null;
  lastName?: string | null;
}

export interface CartValidationsGenerateRunInput {
  buyerJourney: { step?: string | null };
  validation?: { metafield?: { jsonValue?: unknown } | null } | null;
  cart: {
    lines: { quantity: number }[];
    cost: { totalAmount: { amount: string | number } };
    buyerIdentity?: {
      email?: string | null;
      phone?: string | null;
      customer?: (Name & { email?: string | null; displayName?: string | null }) | null;
    } | null;
    deliveryGroups: {
      deliveryAddress?: (Name & { phone?: string | null; zip?: string | null }) | null;
    }[];
  };
}

export interface CartValidationsGenerateRunResult {
  operations: { validationAdd: { errors: { message: string; target: string }[] } }[];
}

const DEFAULT_MESSAGE = "An error occurred during the checkout process.";
const CHECKED_STEPS = ["CHECKOUT_INTERACTION", "CHECKOUT_COMPLETION"];

function readConfig(value: unknown): CheckoutValidationConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Partial<CheckoutValidationConfig>;
  return {
    message: typeof config.message === "string" && config.message ? config.message : DEFAULT_MESSAGE,
    preventZero: config.preventZero === true,
    rules: Array.isArray(config.rules) ? config.rules : [],
  };
}

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const none = { operations: [] };
  // Adding to cart is never blocked; only checkout itself.
  const step = input.buyerJourney.step;
  if (step && !CHECKED_STEPS.includes(step)) return none;

  const config = readConfig(input.validation?.metafield?.jsonValue);
  if (!config) return none;

  const { cart } = input;
  const buyer = cart.buyerIdentity;
  const addresses = cart.deliveryGroups
    .map((group) => group.deliveryAddress)
    .filter((address) => address != null);

  const identity = buildIdentity({
    emails: [buyer?.email, buyer?.customer?.email],
    phones: [buyer?.phone, ...addresses.map((address) => address.phone)],
    names: [
      [buyer?.customer?.firstName, buyer?.customer?.lastName],
      buyer?.customer?.displayName,
      ...addresses.map((address): [string | null | undefined, string | null | undefined] => [
        address.firstName,
        address.lastName,
      ]),
    ],
    zips: addresses.map((address) => address.zip),
  });

  const zeroTotal =
    config.preventZero && cart.lines.length > 0 && Number(cart.cost.totalAmount.amount) <= 0;

  if (!zeroTotal && !findCustomerMatch(identity, config.rules)) return none;
  return {
    operations: [{ validationAdd: { errors: [{ message: config.message, target: "$.cart" }] } }],
  };
}
