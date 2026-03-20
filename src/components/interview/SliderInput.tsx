import { useState } from "react";

interface SliderInputProps {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  value?: number;
  onChange: (value: number) => void;
}

export default function SliderInput({ min, max, minLabel, maxLabel, value: initialValue, onChange }: SliderInputProps) {
  const midpoint = Math.floor((min + max) / 2);
  const [value, setValue] = useState(initialValue ?? midpoint);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value);
    setValue(v);
    onChange(v);
  };

  const pct = ((value - min) / (max - min)) * 100;
  const color = pct < 33 ? "from-red-500 to-orange-500" : pct < 66 ? "from-orange-500 to-yellow-500" : "from-yellow-500 to-green-500";

  const handleClick = (v: number) => {
    setValue(v);
    onChange(v);
  };

  // Show clickable number labels when range is small enough (e.g. 1-5, 1-10)
  const range = max - min;
  const showNumbers = range <= 10;

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <span className="text-5xl font-bold text-foreground tabular-nums">{value}</span>
        <span className="text-muted-foreground text-lg ml-1">/ {max}</span>
      </div>
      <div className="relative px-2">
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-2 rounded-full bg-muted" />
        <div className={`absolute left-2 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r ${color} transition-all duration-150`} style={{ width: `calc(${pct}% - 4px)` }} />
        <input type="range" min={min} max={max} value={value} onChange={handleChange}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer z-10
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg" />
      </div>
      {showNumbers ? (
        <div className="flex justify-between px-2">
          {Array.from({ length: range + 1 }, (_, i) => min + i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleClick(n)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer
                ${n === value
                  ? "bg-white text-black shadow-lg scale-110"
                  : "bg-muted text-muted-foreground hover:bg-white/20 hover:text-foreground"
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex justify-between text-xs text-muted-foreground px-2">
          <span>{minLabel || min}</span>
          <span>{maxLabel || max}</span>
        </div>
      )}
      {showNumbers && (minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-muted-foreground px-2">
          <span>{minLabel || min}</span>
          <span>{maxLabel || max}</span>
        </div>
      )}
    </div>
  );
}
