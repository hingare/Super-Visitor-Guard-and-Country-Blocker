import { useMemo, useState } from "react";

import { flagEmoji } from "../lib/format";
import { frameStyles as styles } from "./AppFrame";

// Country chips picker for forms: keeps the selection locally and submits it
// as one hidden "countries" input per code.
export function CountryMultiSelect({
  id,
  options,
  defaultValue = [],
}: {
  id: string;
  options: { code: string; name: string }[];
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const names = useMemo(() => new Map(options.map((option) => [option.code, option.name])), [options]);

  const text = query.trim().toLowerCase();
  const matches = options
    .filter((option) => !selected.includes(option.code))
    .filter((option) => !text || option.name.toLowerCase().includes(text) || option.code.toLowerCase() === text)
    .slice(0, 50);

  return (
    <div>
      {selected.map((code) => (
        <input key={code} type="hidden" name="countries" value={code} />
      ))}
      <div className={styles.picker}>
        <input
          id={id}
          className={styles.input}
          placeholder="Please select countries"
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {open && matches.length > 0 && (
          <ul className={styles.pickerList} role="listbox">
            {matches.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  className={styles.pickerItem}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelected((current) => [...current, option.code]);
                    setQuery("");
                  }}
                >
                  <span aria-hidden="true">{flagEmoji(option.code)}</span>
                  {option.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((code) => (
            <span key={code} className={styles.chip}>
              <span aria-hidden="true">{flagEmoji(code)}</span>
              {names.get(code) ?? code}
              <button
                type="button"
                aria-label={`Remove ${names.get(code) ?? code}`}
                onClick={() => setSelected((current) => current.filter((item) => item !== code))}
              >
                <s-icon type="x" size="small" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
