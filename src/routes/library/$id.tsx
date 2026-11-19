import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clapperboard, Download, ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { BackLink } from "@/client/studio/BackLink";
import { errorText, settingsLine, when } from "@/client/studio/format";
import { Media, downloadUrl } from "@/client/studio/Media";
import { StudioNav } from "@/client/studio/StudioNav";
import { deleteAsset, getAsset } from "@/serverFunctions/studio";

export const Route = createFileRoute("/library/$id")({
  loader: ({ params }) => getAsset({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Asset · Media Generator" }] }),
  component: AssetPage,
});

const TITLES = { image: "Generated image", video: "Generated video", upload: "Uploaded image" } as const;

function AssetPage() {
  const asset = Route.useLoaderData();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isImage = asset.type !== "video";

  async function remove() {
    setDeleting(true);
    try {
      await deleteAsset({ data: { id: asset.id } });
      toast.success("Deleted.");
      await navigate({ to: "/library" });
    } catch (cause) {
      toast.error(errorText(cause));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader
        backLink={<BackLink to="/library">Library</BackLink>}
        title={TITLES[asset.type]}
        description={when(asset.createdAt)}
        actions={
          <>
            <a href={downloadUrl(asset.id)} className={buttonVariants({ variant: "outline" })}>
                <Download data-icon="inline-start" />
                Download
              </a>
            <Button variant="outline" onClick={() => setConfirming(true)} data-testid="delete-asset">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </>
        }
      />
      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        <Media asset={asset} controls className="max-h-[70vh] w-full object-contain" testId="asset-media" />
      </div>
      {asset.prompt ? (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Prompt</dt>
          <dd className="whitespace-pre-wrap">{asset.prompt}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd>{asset.modelLabel}</dd>
          <dt className="text-muted-foreground">Settings</dt>
          <dd>{settingsLine(asset.settings)}</dd>
          {asset.generationId ? (
            <>
              <dt className="text-muted-foreground">Generation</dt>
              <dd>
                <Link to="/generations/$id" params={{ id: asset.generationId }} className="text-primary hover:underline">
                  Open
                </Link>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {isImage ? (
        <div className="flex flex-wrap gap-2">
          <Link to="/" search={{ ref: asset.id }} className={buttonVariants()} data-testid="use-as-reference">
            <ImagePlus data-icon="inline-start" />
            Use as reference
          </Link>
          <Link
            to="/video"
            search={{ start: asset.id }}
            className={buttonVariants({ variant: "outline" })}
            data-testid="use-as-start"
          >
            <Clapperboard data-icon="inline-start" />
            Animate as video
          </Link>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete this asset?"
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onConfirm={() => void remove()}
          onClose={() => setConfirming(false)}
        >
          The file is removed for good.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
