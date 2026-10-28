import type { RuleList } from "@prisma/client";
import { addRules, deleteRules, listRules } from "./rules.server";
import type { ActionResult } from "./blocker.server";
import { isListRuleType, parseRuleValue, type ListRuleType } from "../lib/rule-specs";

// Shared loader and action plumbing for the list cards on the Phase 3
// blocker pages (see RuleListCard).

export interface ListSpec {
  type: ListRuleType | ListRuleType[];
  list: RuleList | RuleList[];
  // URL parameter prefix when a page shows more than one list.
  prefix?: string;
}

export function loadList(url: URL, shopId: string, spec: ListSpec) {
  const prefix = spec.prefix ?? "";
  return listRules({
    shopId,
    type: spec.type,
    list: Array.isArray(spec.list) ? undefined : spec.list,
    search: url.searchParams.get(`${prefix}q`) ?? undefined,
    page: Number(url.searchParams.get(`${prefix}page`)) || 1,
  });
}

function allows(spec: ListSpec, type: ListRuleType, list: RuleList) {
  const types = Array.isArray(spec.type) ? spec.type : [spec.type];
  const lists = Array.isArray(spec.list) ? spec.list : [spec.list];
  return types.includes(type) && lists.includes(list);
}

// Handles the "addRule" and "deleteRule" intents for the given lists.
// Returns null for any other intent so the page can handle it.
export async function handleListIntent(
  shopId: string,
  form: FormData,
  specs: ListSpec[],
): Promise<ActionResult | null> {
  const intent = form.get("intent");
  if (intent !== "addRule" && intent !== "deleteRule") return null;

  const type = String(form.get("type"));
  const list = form.get("list") === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
  if (!isListRuleType(type) || !specs.some((spec) => allows(spec, type, list))) {
    return { ok: false, error: "Unknown rule type." };
  }

  if (intent === "deleteRule") {
    await deleteRules(shopId, { id: String(form.get("id")), type, list });
    return { ok: true, message: "Rule deleted" };
  }

  const matchType = form.get("matchType") === "PARTIAL" ? "PARTIAL" : "EXACT";
  const parsed = parseRuleValue(type, String(form.get("value") ?? ""), matchType);
  if (!parsed.ok) return parsed;
  const comment = String(form.get("comment") ?? "").trim().slice(0, 200) || null;
  const added = await addRules(shopId, type, list, [{ value: parsed.value, matchType, comment }]);
  return added
    ? { ok: true, message: "Rule added" }
    : { ok: false, error: "That rule already exists." };
}
