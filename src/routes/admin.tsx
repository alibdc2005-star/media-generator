import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { errorText, when } from "@/client/studio/format";
import { Media } from "@/client/studio/Media";
import { Pager } from "@/client/studio/Pager";
import { StudioNav } from "@/client/studio/StudioNav";
import { deleteAsset, getAllAssets } from "@/serverFunctions/studio";

export const Route = createFileRoute("/admin")({
  validateSearch: z.object({ page: z.number().int().min(1).optional() }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }) => getAllAssets({ data: deps }),
  head: () => ({ meta: [{ title: "All assets · Media Generator" }] }),
  component: AdminPage,
});

function AdminPage() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const [target, setTarget] = useState<{ id: string; ownerEmail?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!target) return;
    setDeleting(true);
    try {
      await deleteAsset({ data: { id: target.id } });
      toast.success("Deleted.");
      setTarget(null);
      await navigate({ search: (prev) => prev });
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setDeleting(false);
    }
  }

  if (!data.allowed) {
    return (
      <AppShell nav={<StudioNav />}>
        <PageHeader title="All assets" />
        <EmptyState kind="error" title="Only organization admins can open this page." />
      </AppShell>
    );
  }

  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader title="All assets" description="Every member's images, videos and uploads." />
      {data.items.length === 0 ? (
        <EmptyState title="No assets yet" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {data.items.map((asset) => (
            <li key={asset.id} className="flex items-center gap-3 px-4 py-3" data-testid="admin-asset-row">
              <Media asset={asset} className="size-14 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">{asset.ownerEmail}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {asset.prompt ?? "Uploaded image"} · {when(asset.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete asset"
                onClick={() => setTarget(asset)}
                data-testid="admin-delete"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={data.page} pageCount={data.pageCount} onPage={(page) => void navigate({ search: { page } })} />
      {target ? (
        <ConfirmDialog
          title={`Delete ${target.ownerEmail ?? "this member"}'s asset?`}
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onConfirm={() => void remove()}
          onClose={() => setTarget(null)}
        >
          The file is removed for good.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
