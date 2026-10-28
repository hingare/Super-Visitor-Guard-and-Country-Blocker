import type { ReactNode } from "react";
import { NavLink } from "react-router";

import {
  APP_NAME,
  APP_VERSION,
  REVIEW_URL,
  SUPPORT_EMAIL,
} from "../lib/app-info";
import { SECTION_GROUPS, sectionHref, type IconName } from "../lib/sections";
import styles from "./app-frame.module.css";

interface AppFrameProps {
  ownerName: string;
  shopHandle: string;
  children: ReactNode;
}

function Logo() {
  return (
    <span className={styles.logo}>
      <s-icon type="shield-check-mark" tone="success" />
      <span className={styles.logoText}>{APP_NAME}</span>
    </span>
  );
}

// The app's own frame: top bar, grouped sidebar, content column and footer.
export function AppFrame({ ownerName, shopHandle, children }: AppFrameProps) {
  const initial = (ownerName || shopHandle || "?").charAt(0).toUpperCase();

  return (
    <div className={styles.frame}>
      <header className={styles.topBar}>
        <Logo />
        <div className={styles.topBarRight}>
          <a
            className={styles.reviewButton}
            href={REVIEW_URL}
            target="_blank"
            rel="noreferrer"
          >
            Write a review:{" "}
            <span className={styles.stars} aria-hidden="true">
              ★★★★★
            </span>
          </a>
          <div className={styles.user}>
            <span className={styles.avatar}>{initial}</span>
            <span className={styles.userText}>
              <span className={styles.userName}>{ownerName}</span>
              <span className={styles.userHandle}>{shopHandle}</span>
            </span>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="App navigation">
          {SECTION_GROUPS.map((group, index) => (
            <div key={group.heading ?? `group-${index}`} className={styles.group}>
              {group.heading && (
                <div className={styles.groupHeading}>{group.heading}</div>
              )}
              {group.sections.map((section) => (
                <NavLink
                  key={section.slug || "dashboard"}
                  to={sectionHref(section)}
                  end={section.slug === ""}
                  className={({ isActive }) =>
                    isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
                  }
                >
                  <s-icon type={section.icon} />
                  <span>{section.title}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
          <footer className={styles.footer}>
            <Logo />
            <span className={styles.version}>ver {APP_VERSION}</span>
          </footer>
        </main>
      </div>

      <a
        className={styles.contactFab}
        href={`mailto:${SUPPORT_EMAIL}`}
        aria-label="Contact support"
      >
        <s-icon type="email" />
      </a>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
    </div>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  icon: IconName;
}

// Dashboard card with a description, one action and an illustration slot.
export function FeatureCard({
  title,
  description,
  actionLabel,
  href,
  icon,
}: FeatureCardProps) {
  return (
    <section className={styles.featureCard}>
      <div className={styles.featureText}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p>{description}</p>
        <NavLink to={href} className={styles.outlineButton}>
          {actionLabel}
        </NavLink>
      </div>
      <div className={styles.featureArt} aria-hidden="true">
        <s-icon type={icon} />
      </div>
    </section>
  );
}

export { styles as frameStyles };
