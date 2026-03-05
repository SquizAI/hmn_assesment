import { useState, useEffect, useCallback, createContext, useContext } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, message, type }]);
    // Start exit animation after 2.5s
    setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    }, 2500);
    // Remove after animation
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
          {items.map((item) => (
            <div
              key={item.id}
              className={`pointer-events-auto px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-sm flex items-center gap-2.5 text-sm font-medium transition-all duration-300 ${
                item.leaving ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              } ${
                item.type === "success"
                  ? "bg-green-500/15 border-green-500/25 text-green-300"
                  : item.type === "error"
                    ? "bg-red-500/15 border-red-500/25 text-red-300"
                    : "bg-blue-500/15 border-blue-500/25 text-blue-300"
              }`}
            >
              {item.type === "success" && (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              )}
              {item.type === "error" && (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              {item.type === "info" && (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
              )}
              {item.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
