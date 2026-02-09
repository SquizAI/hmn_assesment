import { useState } from "react";

interface Option { label: string; value: string; description?: string; }

interface ButtonSelectProps {
  options: Option[];
  multiSelect?: boolean;
  onChange: (value: string | string[]) => void;
  initialValue?: string | string[];
}

export default function ButtonSelect({ options, multiSelect = false, onChange, initialValue }: ButtonSelectProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!initialValue) return new Set();
    return new Set(Array.isArray(initialValue) ? initialValue : [initialValue]);
  });

  const handleSelect = (value: string) => {
    const next = new Set(selected);
    if (multiSelect) {
      next.has(value) ? next.delete(value) : next.add(value);
      setSelected(next);
      onChange(Array.from(next));
    } else {
      next.clear();
      next.add(value);
      setSelected(next);
      onChange(value);
    }
  };

  return (
    <div className="grid gap-3">
      {options.map((opt) => {
        const active = selected.has(opt.value);
        return (
          <button key={opt.value} onClick={() => handleSelect(opt.value)}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group
              ${active ? "bg-white/15 border-white/40 shadow-lg shadow-white/5" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 ${multiSelect ? "rounded-md" : "rounded-full"} border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${active ? "border-white bg-white" : "border-white/30 group-hover:border-white/50"}`}>
                {active && (
                  <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div>
                <div className={`font-medium ${active ? "text-white" : "text-white/80"}`}>{opt.label}</div>
                {opt.description && <div className="text-sm text-white/40 mt-0.5">{opt.description}</div>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
