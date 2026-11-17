import type { ReactNode } from "react";
import { niceMax, shortDay, type DayCounts } from "../lib/analytics";
import { frameStyles as styles } from "./AppFrame";

// Plain SVG charts for the Analytics page; no chart library needed.

export const SERIES = [
  { key: "allowed", label: "Allowed", color: "#007a5c" },
  { key: "redirected", label: "Redirected", color: "#9a6700" },
  { key: "blocked", label: "Blocked", color: "#d72c0d" },
] as const;

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

export function DailyChart({ days }: { days: DayCounts[] }) {
  const max = niceMax(Math.max(0, ...days.map((day) => day.allowed + day.redirected + day.blocked)));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / days.length;
  const barWidth = Math.max(2, Math.min(32, slot * 0.7));
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(max * step));
  // About eight date labels, whatever the range.
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));

  return (
    <>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Page views per day, split into allowed, redirected and blocked"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className={styles.chartGridLine} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className={styles.chartAxisText} x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">
              {tick.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const x = PAD.left + index * slot + (slot - barWidth) / 2;
          let base = 0;
          const total = day.allowed + day.redirected + day.blocked;
          return (
            <g key={day.day}>
              <title>
                {`${shortDay(day.day)}: ${total.toLocaleString("en-US")} page views, ${day.blocked.toLocaleString("en-US")} blocked, ${day.redirected.toLocaleString("en-US")} redirected`}
              </title>
              {SERIES.map((series) => {
                const value = day[series.key];
                if (value === 0) return null;
                const top = y(base + value);
                const height = y(base) - top;
                base += value;
                return <rect key={series.key} x={x} y={top} width={barWidth} height={Math.max(1, height)} fill={series.color} />;
              })}
              {/* A transparent target so quiet days still show their tooltip. */}
              <rect x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotHeight} fill="transparent" />
              {(days.length - 1 - index) % labelEvery === 0 && (
                <text className={styles.chartAxisText} x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle">
                  {shortDay(day.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className={styles.chartLegend}>
        {SERIES.map((series) => (
          <span key={series.key} className={styles.chartLegendItem}>
            <span className={styles.chartSwatch} style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <table className={styles.visuallyHidden}>
        <caption>Page views per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            {SERIES.map((series) => (
              <th key={series.key}>{series.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <td>{day.day}</td>
              {SERIES.map((series) => (
                <td key={series.key}>{day[series.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// One horizontal bar per item; `part` is drawn in red inside `value`.
export function BarList({
  rows,
}: {
  rows: { key: string; label: ReactNode; value: number; part?: number; note?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className={styles.barList}>
      {rows.map((row) => {
        const width = (row.value / max) * 100;
        const partWidth = row.part ? (row.part / max) * 100 : 0;
        return (
          <li key={row.key} className={styles.barRow}>
            <span>{row.label}</span>
            <span className={styles.barTrack} aria-hidden="true">
              {row.part !== undefined ? (
                <>
                  <span style={{ width: `${partWidth}%`, background: "#d72c0d" }} />
                  <span style={{ width: `${width - partWidth}%`, background: "#007a5c" }} />
                </>
              ) : (
                <span style={{ width: `${width}%`, background: "#d72c0d" }} />
              )}
            </span>
            <span className={styles.barValue}>
              {row.value.toLocaleString("en-US")}
              {row.note ? ` ${row.note}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
