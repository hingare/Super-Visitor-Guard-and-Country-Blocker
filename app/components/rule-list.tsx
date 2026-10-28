import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFetcher } from "react-router";

import { frameStyles as styles } from "./AppFrame";
import { Card, CardSection, EmptyState } from "./ui";
import { Pagination, SearchBox, useResultToast } from "./blockers";

type Result = { ok: true; message: string } | { ok: false; error: string };

export interface RuleRow {
  id: string;
  type: string;
  list: string;
  matchType: string;
  value: string;
  comment: string | null;
  hits: number;
  createdAt: string | Date;
}

export interface RuleListData {
  rules: RuleRow[];
  total: number;
  page: number;
  pageCount: number;
}

interface Option {
  value: string;
  label: string;
}

export interface RuleListCardProps {
  data: RuleListData;
  prefix?: string;
  // Left-hand help column; without it the list fills the card.
  help?: ReactNode;
  searchPlaceholder: string;
  addLabel: string;
  emptyTitle: string;
  valueHeading: string;
  valuePlaceholder: string;
  types: Option[];
  lists: Option[];
  matchTypes?: boolean;
  renderValue?: (rule: RuleRow) => ReactNode;
  extraActions?: ReactNode;
}

const MATCH_LABELS: Record<string, string> = { EXACT: "Exact Match", PARTIAL: "Partial Match" };

// Search, add form, table and pagination for one list of rules.
export function RuleListCard({
  data,
  prefix = "",
  help,
  searchPlaceholder,
  addLabel,
  emptyTitle,
  valueHeading,
  valuePlaceholder,
  types,
  lists,
  matchTypes = false,
  renderValue,
  extraActions,
}: RuleListCardProps) {
  const fetcher = useFetcher<Result>();
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(fetcher, (message) => {
    if (message === "Rule added") {
      formRef.current?.reset();
      setAdding(false);
    }
  });
  const label = (options: Option[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;
  const id = (name: string) => `${prefix}${name}`;

  const list = (
    <div>
      <div className={styles.toolbar} style={{ flexWrap: "wrap" }}>
        <SearchBox placeholder={searchPlaceholder} prefix={prefix} />
        {extraActions}
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setAdding((open) => !open)}
        >
          {addLabel}
        </button>
      </div>

      {adding && (
        <fetcher.Form method="post" ref={formRef} className={styles.panel}>
          <input type="hidden" name="intent" value="addRule" />
          {types.length === 1 && <input type="hidden" name="type" value={types[0].value} />}
          {lists.length === 1 && <input type="hidden" name="list" value={lists[0].value} />}
          <div className={styles.formRow}>
            {types.length > 1 && (
              <div>
                <label className={styles.fieldLabel} htmlFor={id("type")}>
                  Type
                </label>
                <select id={id("type")} name="type" className={styles.select}>
                  {types.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {lists.length > 1 && (
              <div>
                <label className={styles.fieldLabel} htmlFor={id("list")}>
                  Action
                </label>
                <select id={id("list")} name="list" className={styles.select}>
                  {lists.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {matchTypes && (
              <div>
                <label className={styles.fieldLabel} htmlFor={id("match")}>
                  Match type
                </label>
                <select id={id("match")} name="matchType" className={styles.select}>
                  <option value="EXACT">Exact Match</option>
                  <option value="PARTIAL">Partial Match</option>
                </select>
              </div>
            )}
            <div>
              <label className={styles.fieldLabel} htmlFor={id("value")}>
                {valueHeading}
              </label>
              <input
                id={id("value")}
                name="value"
                className={styles.input}
                placeholder={valuePlaceholder}
                required
                maxLength={500}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={id("comment")}>
                Note (optional)
              </label>
              <input id={id("comment")} name="comment" className={styles.input} maxLength={200} />
            </div>
            <button type="submit" className={styles.primaryButton}>
              Add
            </button>
          </div>
        </fetcher.Form>
      )}

      {data.total === 0 ? (
        <EmptyState title={emptyTitle} text="Try changing the filters or create a new one." />
      ) : (
        <>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Created At</th>
                {types.length > 1 && <th>Type</th>}
                <th>{valueHeading}</th>
                {lists.length > 1 && <th>Action</th>}
                {matchTypes && <th>Matching</th>}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{new Date(rule.createdAt).toLocaleString()}</td>
                  {types.length > 1 && <td>{label(types, rule.type)}</td>}
                  <td>
                    {renderValue ? renderValue(rule) : rule.value}
                    {rule.comment && <div className={styles.muted}>{rule.comment}</div>}
                  </td>
                  {lists.length > 1 && <td>{label(lists, rule.list)}</td>}
                  {matchTypes && <td>{MATCH_LABELS[rule.matchType] ?? rule.matchType}</td>}
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Delete ${rule.value}`}
                      onClick={() =>
                        fetcher.submit(
                          { intent: "deleteRule", id: rule.id, type: rule.type, list: rule.list },
                          { method: "POST" },
                        )
                      }
                    >
                      <s-icon type="delete" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            total={data.total}
            page={data.page}
            pageCount={data.pageCount}
            prefix={prefix}
          />
        </>
      )}
    </div>
  );

  return (
    <Card>
      <CardSection>
        {help ? (
          <div className={styles.twoColumn}>
            <div className={styles.columnHelp}>{help}</div>
            {list}
          </div>
        ) : (
          list
        )}
      </CardSection>
    </Card>
  );
}
