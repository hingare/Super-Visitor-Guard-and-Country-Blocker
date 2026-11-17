import { useState } from "react";
import { useFetcher } from "react-router";

import { frameStyles as styles } from "./AppFrame";
import { Card, CardSection } from "./ui";
import { useResultToast } from "./blockers";
import type { BlockPageLook } from "../lib/block-page-look";
import { VISITOR_LANGUAGES } from "../lib/visitor-texts";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Settings card: the store's logo and color on the pages visitors see.
// Posts intent "blockPageLook".
export function BlockPageLookCard({ look }: { look: BlockPageLook }) {
  const fetcher = useFetcher<Result>();
  const [useBrand, setUseBrand] = useState(look.useBrand);
  const [color, setColor] = useState(look.color ?? "");
  useResultToast(fetcher);

  return (
    <Card>
      <CardSection title="Block Page Look">
        <p style={{ marginTop: 0 }}>
          Visitors see the block page, the browser check page and the
          regional store offer in their own language ({VISITOR_LANGUAGES.length}{" "}
          languages). A header or message you wrote yourself is shown as you
          wrote it.
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="blockPageLook" />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              name="useBrand"
              checked={useBrand}
              onChange={(event) => setUseBrand(event.target.checked)}
            />
            <span>Show my store&apos;s logo and brand color on these pages</span>
          </label>
          {useBrand && (
            <div className={styles.panel}>
              <p className={styles.helpText} style={{ marginTop: 0 }}>
                By default the logo and primary color set in Shopify under
                Settings &gt; Brand are used. Fill in these fields only to use
                something else.
              </p>
              <label className={styles.fieldLabel} htmlFor="look-logo">
                Logo address (optional)
              </label>
              <input
                id="look-logo"
                name="logoUrl"
                className={styles.input}
                placeholder="https://cdn.shopify.com/.../logo.png"
                defaultValue={look.logoUrl ?? ""}
                maxLength={500}
              />
              <label className={styles.fieldLabel} htmlFor="look-color">
                Brand color (optional)
              </label>
              <div className={styles.formRow}>
                <input
                  type="color"
                  aria-label="Pick a color"
                  value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#202223"}
                  onChange={(event) => setColor(event.target.value)}
                  style={{ width: 44, height: 36, padding: 0, border: "none", background: "none" }}
                />
                <input
                  id="look-color"
                  name="color"
                  className={styles.input}
                  placeholder="#1a73e8"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  maxLength={7}
                />
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button type="submit" className={styles.primaryButton} disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "Saving..." : "Save"}
            </button>
          </div>
        </fetcher.Form>
      </CardSection>
    </Card>
  );
}
