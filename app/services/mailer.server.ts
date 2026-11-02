import nodemailer, { type Transporter } from "nodemailer";
import { APP_NAME } from "../lib/app-info";

// Outgoing email (support messages, cancelled-order notices) over SMTP.
// Set SMTP_URL, e.g. smtps://user:pass@smtp.example.com:465, and MAIL_FROM.
// Without SMTP_URL nothing is sent and callers fall back to other channels.

/* eslint-disable no-undef */
const SMTP_URL = process.env.SMTP_URL;
const MAIL_FROM = process.env.MAIL_FROM || `${APP_NAME} <no-reply@localhost>`;
export const SUPPORT_INBOX = process.env.SUPPORT_EMAIL || "";
/* eslint-enable no-undef */

let transporter: Transporter | null = null;

export function mailConfigured() {
  return Boolean(SMTP_URL);
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!SMTP_URL) {
    console.warn(`Email not sent (SMTP_URL is not set): ${message.subject}`);
    return false;
  }
  transporter ??= nodemailer.createTransport(SMTP_URL);
  await transporter.sendMail({ from: MAIL_FROM, ...message });
  return true;
}
