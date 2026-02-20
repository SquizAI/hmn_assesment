interface RiskItem {
  description: string;
  frequency: number;
  severity?: string;
}

interface RiskSignalsProps {
  redFlags: RiskItem[];
  greenLights: RiskItem[];
  loading?: boolean;
}

export default function RiskSignals({ redFlags, greenLights, loading }: RiskSignalsProps) {
  if (loading) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <div className="h-4 w-28 bg-white/5 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = redFlags.length > 0 || greenLights.length > 0;

  if (!hasData) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">
          Risk Signals
        </h2>
        <div className="h-32 flex items-center justify-center text-white/30 text-sm">
          No risk signals detected yet
        </div>
      </div>
    );
  }

  // Sort by frequency
  const sortedFlags = [...redFlags].sort((a, b) => b.frequency - a.frequency).slice(0, 6);
  const sortedLights = [...greenLights].sort((a, b) => b.frequency - a.frequency).slice(0, 6);

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
      <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
        Risk Signals
      </h2>

      <div className="space-y-4">
        {/* Red Flags */}
        {sortedFlags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-[10px] text-red-400/70 uppercase tracking-wider font-medium">
                Red Flags ({redFlags.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {sortedFlags.map((flag, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/10"
                >
                  <span className="text-red-400/60 text-xs mt-0.5 flex-shrink-0">!!</span>
                  <span className="text-xs text-white/60 leading-tight flex-1 line-clamp-2">
                    {flag.description}
                  </span>
                  {flag.frequency > 1 && (
                    <span className="text-[9px] text-red-400/50 tabular-nums flex-shrink-0">
                      x{flag.frequency}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Green Lights */}
        {sortedLights.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-medium">
                Green Lights ({greenLights.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {sortedLights.map((light, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/10"
                >
                  <span className="text-emerald-400/60 text-xs mt-0.5 flex-shrink-0">++</span>
                  <span className="text-xs text-white/60 leading-tight flex-1 line-clamp-2">
                    {light.description}
                  </span>
                  {light.frequency > 1 && (
                    <span className="text-[9px] text-emerald-400/50 tabular-nums flex-shrink-0">
                      x{light.frequency}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
