import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { BackLink } from "@/client/studio/BackLink";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { errorText, settingsLine, when } from "@/client/studio/format";
import { Media, downloadUrl } from "@/client/studio/Media";
import { StatusBadge, isPending } from "@/client/studio/StatusBadge";
import { StudioNav } from "@/client/studio/StudioNav";
import { usePolling } from "@/client/studio/usePolling";
import { getGeneration, regenerate, retryGeneration } from "@/serverFunctions/studio";

export const Route = createFileRoute("/generations/$id")({
  loader: ({ params }) => getGeneration({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Generation · Media Generator" }] }),
  component: GenerationPage,
});

function GenerationPage() {
  const { generation: g, assets } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"retry" | "regenerate" | null>(null);
  const pending = isPending(g.status);
  usePolling(pending);

  async function onRegenerate() {
    setBusy("regenerate");
    try {
      const next = await regenerate({ data: { id: g.id } });
      await navigate({ to: "/generations/$id", params: { id: next.id } });
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function onRetry() {
    setBusy("retry");
    try {
      await retryGeneration({ data: { id: g.id } });
      await router.invalidate();
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  const expected = g.kind === "image" ? (g.settings.count ?? 1) : 1;
  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader
        backLink={<BackLink to="/generations">Generations</BackLink>}
        title={g.kind === "image" ? "Image generation" : "Video generation"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={g.status} testId="generation-status" />
            {g.modelLabel} · {settingsLine(g.settings)} · {when(g.createdAt)}
          </span>
        }
        actions={
          g.status === "failed" ? (
            <Button onClick={onRetry} pending={busy === "retry"} data-testid="retry">
              <RotateCcw data-icon="inline-start" />
              Retry
            </Button>
          ) : g.status === "succeeded" ? (
            <Button variant="outline" onClick={onRegenerate} pending={busy === "regenerate"} data-testid="regenerate">
              <RefreshCw data-icon="inline-start" />
              Regenerate
            </Button>
          ) : null
        }
      />

      <p className="text-sm whitespace-pre-wrap">{g.prompt}</p>

      {g.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription data-testid="generation-error">{g.error}</AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: expected }, (_, i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {assets.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {assets.map((asset) => (
            <figure key={asset.id} className="space-y-2" data-testid="result-asset">
              <Link to="/library/$id" params={{ id: asset.id }} className="block overflow-hidden rounded-lg border border-border">
                <Media
                  asset={asset}
                  controls={asset.type === "video"}
                  className="w-full object-contain"
                  testId={asset.type === "video" ? "result-video" : undefined}
                />
              </Link>
              <a href={downloadUrl(asset.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download data-icon="inline-start" />
                Download
              </a>
            </figure>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}
