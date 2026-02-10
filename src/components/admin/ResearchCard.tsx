import { useState } from "react";
import type { ResearchData } from "../../lib/types";

interface Props {
  research: ResearchData | null;
  onTriggerResearch?: () => void;
  triggerLoading?: boolean;
  showPersonProfile?: boolean;
  showCompanyProfile?: boolean;
}

function ConfidenceBadge({ level }: { level: string }) {
  const color =
    level === "high" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    level === "medium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color} uppercase tracking-wider font-semibold`}>
      {level} confidence
    </span>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">{label}</h4>
      {count !== undefined && (
        <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

export default function ResearchCard({
  research,
  onTriggerResearch,
  triggerLoading,
  showPersonProfile = true,
  showCompanyProfile = true,
}: Props) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  // No research — show trigger button
  if (!research || research.status === "no_results" || research.status === "error") {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-white/50">
            {research?.status === "error" ? "Research failed" :
             research?.status === "no_results" ? "No results found" :
             "No research data available"}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Web scraping will search for public information about this person and their company.
          </p>
        </div>
        {onTriggerResearch && (
          <button
            onClick={onTriggerResearch}
            disabled={triggerLoading}
            className="px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/25 transition-all disabled:opacity-40"
          >
            {triggerLoading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Researching...
              </span>
            ) : "Trigger Research"}
          </button>
        )}
      </div>
    );
  }

  const { personProfile, companyProfile, keyInsights, interviewAngles, confidenceLevel, sources } = research;

  return (
    <div className="space-y-4">
      {/* Confidence + sources header */}
      <div className="flex items-center justify-between">
        {confidenceLevel && <ConfidenceBadge level={confidenceLevel} />}
        {sources && sources.length > 0 && (
          <button
            onClick={() => setSourcesExpanded((e) => !e)}
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
          >
            {sources.length} source{sources.length > 1 ? "s" : ""}
            <svg className={`w-3 h-3 transition-transform ${sourcesExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
      </div>

      {sourcesExpanded && sources && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-3 py-2 space-y-1">
          {sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-blue-400/60 hover:text-blue-400 truncate transition-colors"
            >
              {src.title || src.url}
            </a>
          ))}
        </div>
      )}

      {/* Person profile */}
      {showPersonProfile && personProfile && (
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 space-y-3">
          <SectionHeader label="Person Profile" />

          {personProfile.bio && (
            <p className="text-sm text-white/60 leading-relaxed">{personProfile.bio}</p>
          )}

          {personProfile.knownRoles && personProfile.knownRoles.length > 0 && (
            <div>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Known Roles</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {personProfile.knownRoles.map((role, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {personProfile.linkedinSummary && (
            <div>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">LinkedIn</span>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">{personProfile.linkedinSummary}</p>
            </div>
          )}

          {personProfile.notableAchievements && personProfile.notableAchievements.length > 0 && (
            <div>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Notable Achievements</span>
              <ul className="mt-1 space-y-1">
                {personProfile.notableAchievements.map((a, i) => (
                  <li key={i} className="text-xs text-white/50 flex gap-2">
                    <span className="text-emerald-400/60 mt-0.5">&#x25B8;</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {personProfile.publicPresence && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Public Presence</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                personProfile.publicPresence === "high" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                personProfile.publicPresence === "medium" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                "bg-white/5 text-white/40 border-white/10"
              }`}>
                {personProfile.publicPresence}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Company profile */}
      {showCompanyProfile && companyProfile && (
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 space-y-3">
          <SectionHeader label="Company Profile" />

          {companyProfile.description && (
            <p className="text-sm text-white/60 leading-relaxed">{companyProfile.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {companyProfile.founded && (
              <div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider block">Founded</span>
                <span className="text-xs text-white/60">{companyProfile.founded}</span>
              </div>
            )}
            {companyProfile.size && (
              <div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider block">Size</span>
                <span className="text-xs text-white/60">{companyProfile.size}</span>
              </div>
            )}
            {companyProfile.funding && (
              <div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider block">Funding</span>
                <span className="text-xs text-white/60">{companyProfile.funding}</span>
              </div>
            )}
          </div>

          {companyProfile.products && companyProfile.products.length > 0 && (
            <div>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Products</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {companyProfile.products.map((p, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {companyProfile.recentNews && companyProfile.recentNews.length > 0 && (
            <div>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Recent News</span>
              <ul className="mt-1 space-y-1">
                {companyProfile.recentNews.map((n, i) => (
                  <li key={i} className="text-xs text-white/50 flex gap-2">
                    <span className="text-blue-400/60 mt-0.5">&#x25B8;</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Key insights */}
      {keyInsights && keyInsights.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 space-y-2">
          <SectionHeader label="Key Insights" count={keyInsights.length} />
          <ul className="space-y-1.5">
            {keyInsights.map((insight, i) => (
              <li key={i} className="text-xs text-white/60 flex gap-2">
                <span className="text-amber-400/60 mt-0.5 flex-shrink-0">&#x2022;</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interview angles */}
      {interviewAngles && interviewAngles.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 space-y-2">
          <SectionHeader label="Interview Angles" count={interviewAngles.length} />
          <ul className="space-y-1.5">
            {interviewAngles.map((angle, i) => (
              <li key={i} className="text-xs text-white/60 flex gap-2">
                <span className="text-purple-400/60 mt-0.5 flex-shrink-0">&#x25B8;</span>
                <span>{angle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Re-research button */}
      {onTriggerResearch && (
        <button
          onClick={onTriggerResearch}
          disabled={triggerLoading}
          className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 text-xs hover:bg-white/[0.06] hover:text-white/60 transition-all disabled:opacity-40"
        >
          {triggerLoading ? "Re-researching..." : "Re-research"}
        </button>
      )}
    </div>
  );
}
