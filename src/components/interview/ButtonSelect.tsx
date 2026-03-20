import { useState, useMemo } from "react";

interface Option { label: string; value: string; description?: string; }

interface ButtonSelectProps {
  options: unknown[];
  multiSelect?: boolean;
  onChange: (value: string | string[]) => void;
  initialValue?: string | string[];
}

const OTHER_VALUE = "__other__";

/**
 * Normalize an option from any format into { label, value, description? }.
 *
 * Handles:
 *  - Already-correct objects: { label, value }
 *  - Alternate key names:     { text, id } or { name, key }
 *  - Plain strings:           "Option A" → { label: "Option A", value: "Option A" }
 *  - Numbers:                 42 → { label: "42", value: "42" }
 */
function normalizeOption(raw: unknown, index: number): Option {
  if (typeof raw === "string") {
    return { label: raw, value: raw };
  }
  if (typeof raw === "number") {
    return { label: String(raw), value: String(raw) };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const label =
      (typeof obj.label === "string" && obj.label) ||
      (typeof obj.text === "string" && obj.text) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.title === "string" && obj.title) ||
      "";
    const value =
      (typeof obj.value === "string" && obj.value) ||
      (typeof obj.id === "string" && obj.id) ||
      (typeof obj.key === "string" && obj.key) ||
      label ||
      String(index);
    const description =
      (typeof obj.description === "string" && obj.description) || undefined;
    return { label: label || value, value, description };
  }
  // Fallback for any other type
  return { label: String(raw), value: String(raw) };
}

export default function ButtonSelect({ options, multiSelect = false, onChange, initialValue }: ButtonSelectProps) {
  const normalizedOptions = useMemo(
    () => (options || []).map(normalizeOption).filter((o) => o.label),
    [options],
  );

  // Determine if initial value includes a custom "Other" entry
  const knownValues = useMemo(() => new Set(normalizedOptions.map((o) => o.value)), [normalizedOptions]);

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!initialValue) return new Set();
    const vals = Array.isArray(initialValue) ? initialValue : [initialValue];
    return new Set(vals);
  });
  const [otherText, setOtherText] = useState<string>(() => {
    if (!initialValue) return "";
    const vals = Array.isArray(initialValue) ? initialValue : [initialValue];
    const customVal = vals.find((v) => !knownValues.has(v) && v !== OTHER_VALUE);
    return customVal || "";
  });

  const isOtherSelected = selected.has(OTHER_VALUE) || (otherText && [...selected].some((v) => !knownValues.has(v) && v !== OTHER_VALUE));

  const emitChange = (nextSelected: Set<string>, currentOtherText: string) => {
    // Build the final values: replace OTHER_VALUE sentinel with actual text
    const values = Array.from(nextSelected).map((v) =>
      v === OTHER_VALUE ? (currentOtherText.trim() || OTHER_VALUE) : v
    );
    if (multiSelect) {
      onChange(values);
    } else {
      onChange(values[0] || "");
    }
  };

  const handleSelect = (value: string) => {
    const next = new Set(selected);
    if (multiSelect) {
      next.has(value) ? next.delete(value) : next.add(value);
      // If deselecting "Other", clear the text
      if (value === OTHER_VALUE && !next.has(OTHER_VALUE)) {
        setOtherText("");
      }
      setSelected(next);
      emitChange(next, value === OTHER_VALUE && !next.has(OTHER_VALUE) ? "" : otherText);
    } else {
      next.clear();
      next.add(value);
      if (value !== OTHER_VALUE) setOtherText("");
      setSelected(next);
      emitChange(next, value === OTHER_VALUE ? otherText : "");
    }
  };

  const handleOtherTextChange = (text: string) => {
    setOtherText(text);
    // Ensure "Other" is selected when typing
    const next = new Set(selected);
    if (!next.has(OTHER_VALUE)) {
      if (!multiSelect) next.clear();
      next.add(OTHER_VALUE);
      setSelected(next);
    }
    emitChange(next, text);
  };

  const allOptions = [...normalizedOptions, { label: "Other", value: OTHER_VALUE }];

  return (
    <div className="grid gap-3">
      {allOptions.map((opt) => {
        const isOther = opt.value === OTHER_VALUE;
        const active = isOther ? !!isOtherSelected : selected.has(opt.value);
        return (
          <div key={opt.value}>
            <button onClick={() => handleSelect(opt.value)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group
                ${active ? "bg-white/15 border-white/40 shadow-lg shadow-white/5" : "bg-muted border-border hover:bg-muted hover:border-border"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 ${multiSelect ? "rounded-md" : "rounded-full"} border-2 flex items-center justify-center flex-shrink-0 transition-all
                  ${active ? "border-white bg-white" : "border-border group-hover:border-border"}`}>
                  {active && (
                    <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className={`font-medium ${active ? "text-foreground" : "text-foreground/90"}`}>{opt.label}</div>
                  {opt.description && <div className="text-sm text-muted-foreground mt-0.5">{opt.description}</div>}
                </div>
              </div>
            </button>
            {isOther && active && (
              <input
                type="text"
                value={otherText}
                onChange={(e) => handleOtherTextChange(e.target.value)}
                placeholder="Please specify..."
                autoFocus
                className="mt-2 w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-white/40 focus:bg-white/[0.08] transition-all"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
