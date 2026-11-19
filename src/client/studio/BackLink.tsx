import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function BackLink({ to, children }: { to: "/generations" | "/library" | "/admin"; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
