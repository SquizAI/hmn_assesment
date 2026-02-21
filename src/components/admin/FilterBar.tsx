import { useState, useCallback, useRef, useEffect } from "react";
import type { DashboardFilters } from "../../lib/admin-api";

interface FilterBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  companies: string[];
  assessments: { id: string; name: string }[];
  industries: string[];
  archetypes: string[];
}

const selectClass = (active: boolean) =>
  `appearance-none bg-white/[0.05] border rounded-lg text-xs text-white/80 px-2.5 py-1.5 outline-none transition-colors cursor-pointer ${
    active
      ? "border-purple-500/40 bg-purple-500/10"
      : "border-white/10 hover:border-white/20"
  }`;

const dateClass = (active: boolean) =>
  `bg-white/[0.05] border rounded-lg text-xs text-white/80 px-2.5 py-1.5 outline-none transition-colors [color-scheme:dark] ${
    active
      ? "border-purple-500/40 bg-purple-500/10"
      : "border-white/10 hover:border-white/20"
  }`;

export default function FilterBar({
  filters,
  onChange,
  companies,
  assessments,
  industries,
  archetypes,
}: FilterBarProps) {
  const [localDateFrom, setLocalDateFrom] = useState(filters.dateFrom ?? "");
  const [localDateTo, setLocalDateTo] = useState(filters.dateTo ?? "");
  const debounceFrom = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local date state when filters change externally (e.g. clear)
  useEffect(() => {
    setLocalDateFrom(filters.dateFrom ?? "");
    setLocalDateTo(filters.dateTo ?? "");
  }, [filters.dateFrom, filters.dateTo]);

  const set = useCallback(
    (key: keyof DashboardFilters, value: string) => {
      onChange({ ...filters, [key]: value || undefined });
    },
    [filters, onChange],
  );

  const handleDateFrom = useCallback(
    (value: string) => {
      setLocalDateFrom(value);
      if (debounceFrom.current) clearTimeout(debounceFrom.current);
      debounceFrom.current = setTimeout(() => {
        set("dateFrom", value);
      }, 400);
    },
    [set],
  );

  const handleDateTo = useCallback(
    (value: string) => {
      setLocalDateTo(value);
      if (debounceTo.current) clearTimeout(debounceTo.current);
      debounceTo.current = setTimeout(() => {
        set("dateTo", value);
      }, 400);
    },
    [set],
  );

  const handleDateFromBlur = useCallback(() => {
    if (debounceFrom.current) clearTimeout(debounceFrom.current);
    set("dateFrom", localDateFrom);
  }, [localDateFrom, set]);

  const handleDateToBlur = useCallback(() => {
    if (debounceTo.current) clearTimeout(debounceTo.current);
    set("dateTo", localDateTo);
  }, [localDateTo, set]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const hasFilters = activeCount > 0;

  const clearAll = useCallback(() => {
    onChange({});
  }, [onChange]);

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 px-4 py-3 flex flex-wrap items-center gap-2.5">
      {/* Company */}
      <select
        value={filters.company ?? ""}
        onChange={(e) => set("company", e.target.value)}
        className={selectClass(!!filters.company)}
      >
        <option value="">All Companies</option>
        {companies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* Assessment */}
      <select
        value={filters.assessmentTypeId ?? ""}
        onChange={(e) => set("assessmentTypeId", e.target.value)}
        className={selectClass(!!filters.assessmentTypeId)}
      >
        <option value="">All Assessments</option>
        {assessments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {/* Date From */}
      <label className="flex items-center gap-1.5 text-xs text-white/40">
        From:
        <input
          type="date"
          value={localDateFrom}
          onChange={(e) => handleDateFrom(e.target.value)}
          onBlur={handleDateFromBlur}
          className={dateClass(!!filters.dateFrom)}
        />
      </label>

      {/* Date To */}
      <label className="flex items-center gap-1.5 text-xs text-white/40">
        To:
        <input
          type="date"
          value={localDateTo}
          onChange={(e) => handleDateTo(e.target.value)}
          onBlur={handleDateToBlur}
          className={dateClass(!!filters.dateTo)}
        />
      </label>

      {/* Industry */}
      <select
        value={filters.industry ?? ""}
        onChange={(e) => set("industry", e.target.value)}
        className={selectClass(!!filters.industry)}
      >
        <option value="">All Industries</option>
        {industries.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>

      {/* Archetype */}
      <select
        value={filters.archetype ?? ""}
        onChange={(e) => set("archetype", e.target.value)}
        className={selectClass(!!filters.archetype)}
      >
        <option value="">All Archetypes</option>
        {archetypes.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      {/* Clear button + active count badge */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="ml-auto flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/20 text-[10px] text-purple-300 font-medium">
            {activeCount}
          </span>
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Clear
        </button>
      )}
    </div>
  );
}
