import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

// ─── Context ────────────────────────────────────────────────────────────────

interface DetailDrawerContextValue {
  openDrawer: (content: ReactNode) => void;
  closeDrawer: () => void;
  isOpen: boolean;
}

const DetailDrawerContext = createContext<DetailDrawerContextValue | null>(null);

export function useDetailDrawer(): DetailDrawerContextValue {
  const ctx = useContext(DetailDrawerContext);
  if (!ctx) throw new Error("useDetailDrawer must be used within DetailDrawerProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function DetailDrawerProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const openDrawer = useCallback((node: ReactNode) => {
    setContent(node);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setContent(null), 300);
  }, []);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
    setTimeout(() => setContent(null), 300);
  }, [location.pathname]);

  return (
    <DetailDrawerContext.Provider value={{ openDrawer, closeDrawer, isOpen }}>
      <div className="flex-1 flex min-h-0">
        {children}

        {/* Mobile backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closeDrawer}
          />
        )}

        {/* Drawer panel — push on desktop, overlay on mobile */}
        <div
          className={`
            fixed top-0 right-0 z-50 h-full w-full sm:w-[480px]
            md:static md:z-auto md:h-auto md:w-auto
            ${isOpen ? "md:min-w-[480px] md:max-w-[480px]" : "md:min-w-0 md:max-w-0"}
            bg-background border-l border-border
            flex flex-col
            transition-all duration-300 ease-in-out
            ${isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
            ${!isOpen ? "md:border-l-0" : ""}
            overflow-hidden
          `}
        >
          {/* Mobile close button */}
          {isOpen && (
            <div className="flex items-center justify-end px-4 py-3 border-b border-border shrink-0 md:hidden">
              <button
                onClick={closeDrawer}
                className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
              >
                &times;
              </button>
            </div>
          )}

          {/* Desktop close button */}
          {isOpen && (
            <div className="hidden md:flex items-center justify-end px-4 py-2 border-b border-border shrink-0">
              <button
                onClick={closeDrawer}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none p-1"
              >
                &times;
              </button>
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    </DetailDrawerContext.Provider>
  );
}
