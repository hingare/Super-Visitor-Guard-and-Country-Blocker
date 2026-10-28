import type { ReactNode } from "react";
import { Link } from "react-router";
import { frameStyles as styles } from "./AppFrame";

export function Card({ children }: { children: ReactNode }) {
  return <section className={styles.card}>{children}</section>;
}

export function CardSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.cardSection}>
      {title && <h2 className={styles.cardTitle}>{title}</h2>}
      {children}
    </div>
  );
}

const BANNER_TONES = {
  info: { className: "", icon: "info", iconTone: "info" },
  warning: { className: "bannerWarning", icon: "alert-circle", iconTone: "caution" },
  success: { className: "bannerSuccess", icon: "check-circle", iconTone: "success" },
} as const;

export function Banner({
  tone = "info",
  children,
}: {
  tone?: keyof typeof BANNER_TONES;
  children: ReactNode;
}) {
  const look = BANNER_TONES[tone];
  return (
    <div
      className={look.className ? `${styles.banner} ${styles[look.className]}` : styles.banner}
      role="status"
    >
      <s-icon type={look.icon} tone={look.iconTone} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className={styles.emptyState}>
      <s-icon type="page" size="base" />
      <p className={styles.emptyTitle}>{title}</p>
      {text && <p className={styles.emptyText}>{text}</p>}
    </div>
  );
}

// A status line such as "All filters are currently Enabled" next to a switch.
export function StatusToggle({
  enabled,
  label,
  name,
  onToggle,
  disabled,
}: {
  enabled: boolean;
  label: ReactNode;
  name: string;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.toggleRow}>
      <s-icon
        type={enabled ? "check-circle-filled" : "x-circle"}
        tone={enabled ? "success" : "critical"}
      />
      <span>{label}</span>
      <s-switch
        name={name}
        accessibilityLabel={typeof label === "string" ? label : name}
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
    </div>
  );
}

export function ContactUsButton() {
  return (
    <Link className={styles.outlineButton} to="/app/contact">
      Contact us
    </Link>
  );
}

export const REPORTS_NOTICE =
  "Shopify's reports count a visit the moment it arrives, before any app can act on it, so blocked visitors can still appear there. Contact us if you want help keeping them out of your reports.";
