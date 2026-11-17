import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { sendMail } from "../services/mailer.server";
import { APP_NAME } from "../lib/app-info";
import { customerSubject, formatDataRequest, type CompliancePayload } from "../lib/compliance";

// The order log (Filtered Orders) is the only place the app keeps data about
// a store's customers: the order name and the buyer's email.

async function findShop(shopDomain: string) {
  return db.shop.findUnique({ where: { shopDomain }, include: { settings: true } });
}

function subjectFilter(
  shopId: string,
  subject: ReturnType<typeof customerSubject>,
): Prisma.OrderFlagWhereInput | null {
  const conditions: Prisma.OrderFlagWhereInput[] = [];
  if (subject.orderIds.length > 0) conditions.push({ orderId: { in: subject.orderIds } });
  if (subject.email) conditions.push({ email: { equals: subject.email, mode: "insensitive" } });
  return conditions.length > 0 ? { shopId, OR: conditions } : null;
}

// customers/redact: erase the customer's entries from the order log.
export async function redactCustomer(shopDomain: string, payload: CompliancePayload): Promise<number> {
  const shop = await findShop(shopDomain);
  if (!shop) return 0;
  const where = subjectFilter(shop.id, customerSubject(payload));
  if (!where) return 0;
  const { count } = await db.orderFlag.deleteMany({ where });
  return count;
}

// customers/data_request: tell the merchant what is held, so they can answer
// the customer. Returns how many entries were found.
export async function reportCustomerData(shopDomain: string, payload: CompliancePayload): Promise<number> {
  const shop = await findShop(shopDomain);
  if (!shop) return 0;
  const subject = customerSubject(payload);
  const where = subjectFilter(shop.id, subject);
  const records = where
    ? await db.orderFlag.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: { orderName: true, email: true, reason: true, actionTaken: true, createdAt: true },
      })
    : [];

  const to = shop.settings?.notifyEmail || shop.settings?.reportEmail;
  if (to) {
    try {
      await sendMail({
        to,
        subject: `${APP_NAME}: customer data request for ${shopDomain}`,
        text: formatDataRequest(APP_NAME, shopDomain, subject, records),
      });
    } catch (error) {
      console.error(`Could not email the data request summary for ${shopDomain}`, error);
    }
  }
  return records.length;
}
