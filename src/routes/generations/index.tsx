import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Image as ImageIcon } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { buttonVariants } from "@/client/components/ui/button";
import { settingsLine, when } from "@/client/studio/format";
import { StatusBadge, isPending } from "@/client/studio/StatusBadge";
import { StudioNav } from "@/client/studio/StudioNav";
import { usePolling } from "@/client/studio/usePolling";
import { getGenerations } from "@/serverFunctions/studio";

export const Route = createFileRoute("/generations/")({
  loader: () => getGenerations(),
  head: () => ({ meta: [{ title: "Generations · Media Generator" }] }),
  component: GenerationsPage,
});

function GenerationsPage() {
  const generations = Route.useLoaderData();
  usePolling(generations.some((g) => isPending(g.status)));
  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader title="Generations" />
      {generations.length === 0 ? (
        <EmptyState
          media="rows"
          title="No generations yet"
          description="Images and videos you start appear here."
          action={
            <Link to="/" className={buttonVariants()}>
              New image
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {generations.map((g) => (
            <li key={g.id} data-testid="generation-row">
              <Link
                to="/generations/$id"
                params={{ id: g.id }}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                {g.kind === "video" ? (
                  <Film className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Video" />
                ) : (
                  <ImageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Image" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{g.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.modelLabel} · {settingsLine(g.settings)} · {when(g.createdAt)}
                  </p>
                  {g.status === "failed" && g.error ? (
                    <p className="truncate text-xs text-destructive">{g.error}</p>
                  ) : null}
                </div>
                <StatusBadge status={g.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
