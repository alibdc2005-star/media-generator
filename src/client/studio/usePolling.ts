import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/** Reloads the page's data every few seconds while `active`. */
export function usePolling(active: boolean, ms = 2000) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void router.invalidate(), ms);
    return () => clearInterval(timer);
  }, [active, ms, router]);
}
