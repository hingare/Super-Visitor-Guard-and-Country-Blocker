// The "Auto Cancel Order Settings" shared by Block Lists, Fraud Protect and
// Auto-cancel filters.

export const ORDER_SETTINGS = {
  refundOnCancel: "Refund to customer when order cancelled.",
  notifyOnCancel: "Notify me when an order cancelled.",
  deleteCodOrders: "Delete order immediately (Only for COD orders).",
} as const;

export type OrderSetting = keyof typeof ORDER_SETTINGS;

export const ORDER_SETTING_NAMES = Object.keys(ORDER_SETTINGS) as OrderSetting[];

export function isOrderSetting(name: unknown): name is OrderSetting {
  return typeof name === "string" && name in ORDER_SETTINGS;
}

export type OrderSettingValues = Record<OrderSetting, boolean>;

export function pickOrderSettings(settings: OrderSettingValues): OrderSettingValues {
  return {
    refundOnCancel: settings.refundOnCancel,
    notifyOnCancel: settings.notifyOnCancel,
    deleteCodOrders: settings.deleteCodOrders,
  };
}
