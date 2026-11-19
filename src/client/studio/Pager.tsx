import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="prev-page">
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)} data-testid="next-page">
        <ChevronRight />
      </Button>
    </div>
  );
}
