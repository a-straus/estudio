import { useEffect, useState } from "react";

export function useIsPhone(): boolean {
  const mql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(max-width: 639px)") /* bp-tablet 640px */
      : null;

  const [isPhone, setIsPhone] = useState(mql ? mql.matches : false);

  useEffect(() => {
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mql]);

  return isPhone;
}
