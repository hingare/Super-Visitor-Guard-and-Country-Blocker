import db from "../db.server";
import type { ActionResult } from "./blocker.server";
import { isOrderSetting } from "../lib/order-settings";
import { isChecked } from "../lib/settings";

// Handles intent "orderSetting" from OrderSettingsCard.
export async function saveOrderSetting(shopId: string, form: FormData): Promise<ActionResult> {
  const name = form.get("name");
  if (name === "notifyEmail") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    await db.settings.update({ where: { shopId }, data: { notifyEmail: email || null } });
    return { ok: true, message: email ? "Notification email saved" : "Notices go to the store owner's email" };
  }
  if (!isOrderSetting(name)) return { ok: false, error: "Unknown setting." };
  const enabled = isChecked(form.get("enabled"));
  await db.settings.update({ where: { shopId }, data: { [name]: enabled } });
  return { ok: true, message: enabled ? "Setting enabled" : "Setting disabled" };
}
