import { createContext, useContext, type ReactNode } from "react";
import type { WordLanguage } from "@estudio/shared";

interface QuickAddContextValue {
  openQuickAdd: (initialTerm?: string, initialLanguage?: WordLanguage) => void;
}

const QuickAddContext = createContext<QuickAddContextValue>({
  openQuickAdd: () => {},
});

interface QuickAddProviderProps {
  children: ReactNode;
  openQuickAdd: (initialTerm?: string, initialLanguage?: WordLanguage) => void;
}

export function QuickAddProvider({ children, openQuickAdd }: QuickAddProviderProps) {
  return (
    <QuickAddContext.Provider value={{ openQuickAdd }}>
      {children}
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd() {
  return useContext(QuickAddContext);
}
