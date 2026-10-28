// Parsing and validation for the Settings page form. Kept free of server
// imports so it can be unit tested and reused by later phases.

export const ORDER_ACTIONS = ["TAGGED", "CANCELLED", "NOTIFIED"] as const;
export type OrderActionValue = (typeof ORDER_ACTIONS)[number];

export const FAIL_OPEN_MIN_MS = 500;
export const FAIL_OPEN_MAX_MS = 5000;

export interface GeneralSettingsInput {
  failOpenMs: number;
  excludeAdmins: boolean;
  orderAction: OrderActionValue;
  notifyEmail: string | null;
}

export type FieldErrors = Partial<Record<keyof GeneralSettingsInput, string>>;

export type ParseResult =
  | { ok: true; data: GeneralSettingsInput }
  | { ok: false; errors: FieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Polaris checkboxes and switches submit "on" when checked and nothing when not.
export function isChecked(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

export function parseGeneralSettings(form: FormData): ParseResult {
  const errors: FieldErrors = {};

  const failOpenRaw = String(form.get("failOpenMs") ?? "").trim();
  const failOpenMs = Number(failOpenRaw);
  if (
    failOpenRaw === "" ||
    !Number.isInteger(failOpenMs) ||
    failOpenMs < FAIL_OPEN_MIN_MS ||
    failOpenMs > FAIL_OPEN_MAX_MS
  ) {
    errors.failOpenMs = `Enter a whole number between ${FAIL_OPEN_MIN_MS} and ${FAIL_OPEN_MAX_MS}.`;
  }

  const orderAction = String(form.get("orderAction") ?? "");
  if (!ORDER_ACTIONS.includes(orderAction as OrderActionValue)) {
    errors.orderAction = "Choose what happens to a flagged order.";
  }

  const notifyEmailRaw = String(form.get("notifyEmail") ?? "").trim();
  if (notifyEmailRaw !== "" && !EMAIL_PATTERN.test(notifyEmailRaw)) {
    errors.notifyEmail = "Enter a valid email address.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      failOpenMs,
      excludeAdmins: isChecked(form.get("excludeAdmins")),
      orderAction: orderAction as OrderActionValue,
      notifyEmail: notifyEmailRaw === "" ? null : notifyEmailRaw,
    },
  };
}
