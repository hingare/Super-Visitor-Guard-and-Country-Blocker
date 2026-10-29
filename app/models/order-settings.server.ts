import db from "../db.server";
import type { ActionResult } from "./blocker.server";
import { isOrderSetting } from "../lib/order-settings";
import { isChecked } from "../lib/settings";

// Handles intent "orderSetting" from OrderSettingsCard.
export async function saveOrderSetting(shopId: string, form: FormData): Promise<ActionResult> {
  const name = form.get("name");
  if (!isOrderSetting(name)) return { ok: false, error: "Unknown setting." };
  const enabled = isChecked(form.get("enabled"));
  await db.settings.update({ where: { shopId }, data: { [name]: enabled } });
  return { ok: true, message: enabled ? "Setting enabled" : "Setting disabled" };
}
