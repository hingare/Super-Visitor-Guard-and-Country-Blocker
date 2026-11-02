import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { APP_NAME, SUPPORT_EMAIL } from "../lib/app-info";
import { SUPPORT_INBOX, mailConfigured, sendMail } from "../services/mailer.server";
import { PageHeader, frameStyles as styles } from "../components/AppFrame";
import { Banner, Card, CardSection } from "../components/ui";
import { useResultToast } from "../components/blockers";

const TOPICS = [
  "Setting up the app",
  "A visitor is blocked by mistake",
  "Bots, fake orders or abandoned checkouts",
  "Billing",
  "Feature request",
  "Something else",
];

const supportAddress = () => SUPPORT_INBOX || SUPPORT_EMAIL;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let email = "";
  try {
    const response = await admin.graphql(`#graphql
      query ContactShopEmail {
        shop {
          email
        }
      }`);
    const { data } = await response.json();
    email = data?.shop?.email ?? "";
  } catch (error) {
    console.error("Could not load the shop email", error);
  }
  return { email, shop: session.shop, supportEmail: supportAddress(), canSend: mailConfigured() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const topic = String(form.get("topic") ?? "");
  const message = String(form.get("message") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: "Enter the email we should reply to." };
  if (!TOPICS.includes(topic)) return { ok: false as const, error: "Choose a topic." };
  if (message.length < 10) return { ok: false as const, error: "Tell us a little more (at least 10 characters)." };

  try {
    const sent = await sendMail({
      to: supportAddress(),
      replyTo: email,
      subject: `[${APP_NAME}] ${topic} - ${session.shop}`,
      text: [`Store: ${session.shop}`, `From: ${name || "-"} <${email}>`, `Topic: ${topic}`, "", message.slice(0, 5000)].join(
        "\n",
      ),
    });
    if (!sent) {
      return { ok: false as const, error: `Messages cannot be sent from the app yet. Email us at ${supportAddress()}.` };
    }
  } catch (error) {
    console.error("Support message failed", error);
    return { ok: false as const, error: `Your message could not be sent. Email us at ${supportAddress()}.` };
  }
  return { ok: true as const, message: "Message sent. We usually reply within one business day." };
};

export default function Contact() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useResultToast(fetcher);
  const sent = fetcher.data?.ok === true;

  return (
    <>
      <PageHeader title="Contact Us" subtitle="Questions, problems or ideas: we read every message." />

      {!data.canSend && (
        <Banner>
          <p>
            You can also write to us directly at{" "}
            <a href={`mailto:${data.supportEmail}?subject=${encodeURIComponent(`${APP_NAME} - ${data.shop}`)}`}>
              {data.supportEmail}
            </a>
            .
          </p>
        </Banner>
      )}

      <Card>
        <CardSection title="Send us a message">
          {sent ? (
            <p>Thanks! Your message is on its way, and we will reply to the email you gave.</p>
          ) : (
            <fetcher.Form method="post" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
              <label className={styles.fieldLabel}>
                Your name
                <input name="name" className={styles.input} maxLength={100} />
              </label>
              <label className={styles.fieldLabel}>
                Reply to
                <input name="email" type="email" className={styles.input} defaultValue={data.email} required />
              </label>
              <label className={styles.fieldLabel}>
                Topic
                <select name="topic" className={styles.select} defaultValue={TOPICS[0]}>
                  {TOPICS.map((topic) => (
                    <option key={topic}>{topic}</option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Message
                <textarea name="message" className={styles.input} rows={6} maxLength={5000} required />
              </label>
              <p className={styles.helpText}>
                If a visitor was blocked by mistake, include their IP address or
                visitor id (CT-...) from Shop Visitor Logs.
              </p>
              <div>
                <button type="submit" className={styles.primaryButton} disabled={fetcher.state !== "idle"}>
                  Send message
                </button>
              </div>
            </fetcher.Form>
          )}
        </CardSection>
      </Card>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
