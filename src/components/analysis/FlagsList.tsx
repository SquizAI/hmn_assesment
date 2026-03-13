interface FlagItem {
  description: string;
}

interface Props {
  redFlags: FlagItem[];
  greenLights: FlagItem[];
}

export default function FlagsList({ redFlags, greenLights }: Props) {
  if (redFlags.length === 0 && greenLights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {redFlags.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-4">Watch Out For</h3>
          <ul className="space-y-3">
            {redFlags.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/70">
                <span className="text-red-400">&#x2022;</span>{f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {greenLights.length > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-4">Strengths</h3>
          <ul className="space-y-3">
            {greenLights.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/70">
                <span className="text-green-400">&#x2022;</span>{f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
