import { useState } from "react";

const INPUT_TYPES = [
  { value: "ai_conversation", label: "AI Conversation" },
  { value: "open_text", label: "Open Text" },
  { value: "slider", label: "Slider" },
  { value: "buttons", label: "Buttons" },
  { value: "multi_select", label: "Multi Select" },
  { value: "voice", label: "Voice" },
];

export interface QuestionData {
  id: string;
  text: string;
  inputType?: string;
  weight?: string;
  section?: string;
  phase?: string;
}

interface Props {
  question: QuestionData;
  onSave: (editCommand: string) => void;
  onClose: () => void;
}

export default function QuestionEditPopover({ question, onSave, onClose }: Props) {
  const [text, setText] = useState(question.text);
  const [inputType, setInputType] = useState(question.inputType || "open_text");
  const [weight, setWeight] = useState(question.weight || "0.5");

  const handleSave = () => {
    const parts: string[] = [];
    if (text !== question.text) parts.push(`change text to "${text}"`);
    if (inputType !== question.inputType) parts.push(`change input type to ${inputType}`);
    if (weight !== question.weight) parts.push(`change weight to ${weight}`);

    if (parts.length === 0) {
      onClose();
      return;
    }

    const command = `Update question ${question.id}: ${parts.join(" and ")}`;
    onSave(command);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#141420] border border-white/10 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Edit Question</h3>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">{question.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Question text */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-white/40 uppercase tracking-wider">Question Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 resize-none"
          />
        </div>

        {/* Input type + Weight row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] text-white/40 uppercase tracking-wider">Input Type</label>
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/40 appearance-none"
            >
              {INPUT_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#141420]">{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-white/40 uppercase tracking-wider">Weight</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/40"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            Save via AI
          </button>
        </div>
      </div>
    </div>
  );
}
