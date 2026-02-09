import { useState, useEffect } from "react";
import StatusBadge from "../components/admin/StatusBadge";
import AssessmentDrawer from "../components/admin/AssessmentDrawer";
import { fetchAssessments, updateAssessmentStatus } from "../lib/admin-api";

interface Assessment {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedMinutes: number;
  questionCount: number;
  status: string;
}

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const data = await fetchAssessments();
      setAssessments(data.assessments);
    } catch (err) {
      console.error("Failed to fetch assessments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const handleStatusChange = async (
    e: React.MouseEvent,
    id: string,
    newStatus: string
  ) => {
    e.stopPropagation();
    try {
      const result = await updateAssessmentStatus(id, newStatus);
      if (result.ok) {
        await loadAssessments();
      }
    } catch (err) {
      console.error("Failed to update assessment status:", err);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/40" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assessments.map((assessment) => (
          <div
            key={assessment.id}
            className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all cursor-pointer"
            onClick={() => setSelectedAssessmentId(assessment.id)}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{assessment.icon}</span>
              <StatusBadge status={assessment.status} />
            </div>

            <h3 className="text-lg font-semibold text-white mt-3">
              {assessment.name}
            </h3>

            <p className="text-sm text-white/40 mt-1 line-clamp-2">
              {assessment.description}
            </p>

            <div className="mt-4 flex justify-between">
              <span className="text-xs text-white/30">
                {assessment.questionCount} questions
              </span>
              <span className="text-xs text-white/30">
                {assessment.estimatedMinutes} min
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              {assessment.status === "draft" && (
                <button
                  className="px-2 py-1 text-xs rounded-lg border transition-colors bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                  onClick={(e) => handleStatusChange(e, assessment.id, "active")}
                >
                  Activate
                </button>
              )}
              {assessment.status === "active" && (
                <button
                  className="px-2 py-1 text-xs rounded-lg border transition-colors bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20"
                  onClick={(e) => handleStatusChange(e, assessment.id, "archived")}
                >
                  Archive
                </button>
              )}
              {assessment.status === "archived" && (
                <button
                  className="px-2 py-1 text-xs rounded-lg border transition-colors bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                  onClick={(e) => handleStatusChange(e, assessment.id, "active")}
                >
                  Reactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedAssessmentId && (
        <AssessmentDrawer
          assessmentId={selectedAssessmentId}
          onClose={() => setSelectedAssessmentId(null)}
        />
      )}
    </div>
  );
}
