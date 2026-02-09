interface Props {
  role: "user" | "assistant";
  content: string;
}

export default function ChatMessage({ role, content }: Props) {
  const isUser = role === "user";

  // Simple markdown-ish rendering: bold, code, lists, tables
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length > 0) {
        elements.push(
          <table key={`table-${elements.length}`} className="w-full text-sm border-collapse my-2">
            <thead>
              <tr>
                {tableRows[0].map((cell, i) => (
                  <th key={i} className="text-left px-2 py-1 border-b border-white/10 text-white/60 font-medium">{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(2).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1 border-b border-white/5">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        tableRows = [];
      }
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Table detection
      if (line.includes("|") && line.trim().startsWith("|")) {
        if (!inTable) inTable = true;
        tableRows.push(line.split("|").filter(Boolean));
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<br key={`br-${i}`} />);
        continue;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(<h4 key={i} className="font-semibold text-white mt-2 mb-1">{line.slice(4)}</h4>);
        continue;
      }
      if (line.startsWith("## ")) {
        elements.push(<h3 key={i} className="font-bold text-white mt-3 mb-1 text-lg">{line.slice(3)}</h3>);
        continue;
      }

      // List items
      if (line.match(/^[-*•]\s/)) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-white/30 mt-0.5">•</span>
            <span>{formatInline(line.slice(2))}</span>
          </div>
        );
        continue;
      }
      if (line.match(/^\d+\.\s/)) {
        const num = line.match(/^(\d+)\./)?.[1];
        elements.push(
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-white/40 mt-0.5 tabular-nums">{num}.</span>
            <span>{formatInline(line.replace(/^\d+\.\s/, ""))}</span>
          </div>
        );
        continue;
      }

      // Regular paragraph
      elements.push(<p key={i}>{formatInline(line)}</p>);
    }

    if (inTable) flushTable();
    return elements;
  };

  const formatInline = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) parts.push(remaining.slice(0, boldMatch.index));
        parts.push(<strong key={key++} className="font-semibold text-white">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
        continue;
      }

      // Inline code
      const codeMatch = remaining.match(/`(.+?)`/);
      if (codeMatch && codeMatch.index !== undefined) {
        if (codeMatch.index > 0) parts.push(remaining.slice(0, codeMatch.index));
        parts.push(<code key={key++} className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono">{codeMatch[1]}</code>);
        remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
        continue;
      }

      parts.push(remaining);
      break;
    }

    return parts;
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? "bg-blue-500/20 text-white border border-blue-500/30"
          : "bg-white/[0.07] text-white/90 border border-white/10"
      }`}>
        {renderContent(content)}
      </div>
    </div>
  );
}
