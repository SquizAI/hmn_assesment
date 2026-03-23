import { createContext, useContext, useState, useCallback, type ReactNode, type JSX } from "react";

type ToastCategory = "loading" | "success" | "error" | "action";

interface Toast {
  id: number;
  category: ToastCategory;
  message: string;
  leaving: boolean;
}

const WORD_BANKS: Record<ToastCategory, string[]> = {
  loading: [
    "BZZZT... syncing neural pathways...",
    "WHIRR CLANK... crunching numbers...",
    "BEEP BOP... scanning the matrix...",
    "CHKKA CHKKA... booting up subroutines...",
    "WRRRR... spinning up the hamster wheels...",
    "BLEEP BLOOP... defragmenting data cubes...",
    "ZZZAP... charging the flux capacitors...",
    "DOOT DOOT... pinging the mothership...",
    "CLUNK WHIRR... greasing the gears...",
    "SKRRT SKRRT... revving the data engines...",
  ],
  success: [
    "BEEP BOOP! Data locked and loaded!",
    "ZAP ZAP! Mission accomplished!",
    "WOOP WOOP! All systems nominal!",
    "DING DING! Operation complete!",
    "BRRRAP! Nailed it, boss!",
    "KAZAM! Data delivered fresh!",
    "PING PONG! Results are in!",
    "WHOOSH! Smoother than a robot's dance move!",
    "BLEEP! Another one bites the dust!",
    "CLANK CLANK! Victory dance initiated!",
  ],
  error: [
    "BZZT KRRK... something broke!",
    "ERROR ERROR... recalibrating...",
    "SPROING! A cog came loose!",
    "FZZZT... that wasn't supposed to happen...",
    "CLUNK... my circuits are confused...",
    "BORK BORK! Unexpected turbulence!",
  ],
  action: [
    "CLANK WHIRR... executing directive!",
    "BLEEP BLOOP... processing request...",
    "VROOM VROOM... here we go!",
    "CLICK CLACK... engaging overdrive!",
    "SWOOSH... deploying the thing!",
    "CHUGGA CHUGGA... working on it!",
    "KABOOM... in a good way!",
    "TICK TOCK... robot's on the clock!",
  ],
};

const CATEGORY_ICONS: Record<ToastCategory, JSX.Element> = {
  loading: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M9 8V6a3 3 0 016 0v2" /><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" /><path d="M10 17h4" /></svg>,
  success: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>,
  error: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>,
  action: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
};

interface RobotContextValue {
  say: (category: ToastCategory, custom?: string) => void;
}

const RobotContext = createContext<RobotContextValue>({ say: () => {} });

export function useRobot() {
  return useContext(RobotContext);
}

let toastId = 0;

export function RobotProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const say = useCallback((category: ToastCategory, custom?: string) => {
    const bank = WORD_BANKS[category];
    const message = custom || bank[Math.floor(Math.random() * bank.length)];
    const id = ++toastId;

    setToasts((prev) => [...prev.slice(-4), { id, category, message, leaving: false }]);

    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 3000);
  }, []);

  return (
    <RobotContext.Provider value={{ say }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 ${
              toast.leaving
                ? "opacity-0 translate-x-8"
                : "opacity-100 translate-x-0 animate-[wiggle_0.5s_ease-in-out]"
            } ${
              toast.category === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : toast.category === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-300"
                : "bg-foreground/[0.07] border-border text-foreground/90"
            }`}
            style={{ minWidth: 280 }}
          >
            <span className={`flex items-center justify-center ${toast.category === "loading" ? "animate-spin" : "animate-bounce"}`}>
              {CATEGORY_ICONS[toast.category]}
            </span>
            <span className="text-sm font-mono font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </RobotContext.Provider>
  );
}
