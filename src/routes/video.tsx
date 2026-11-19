import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Composer } from "@/client/studio/Composer";
import { StudioNav } from "@/client/studio/StudioNav";
import { getComposer } from "@/serverFunctions/studio";

export const Route = createFileRoute("/video")({
  validateSearch: z.object({ start: z.string().optional() }),
  loaderDeps: ({ search }) => ({ start: search.start }),
  loader: ({ deps }) => getComposer({ data: { assetId: deps.start } }),
  head: () => ({ meta: [{ title: "New video · Media Generator" }] }),
  component: VideoPage,
});

function VideoPage() {
  const data = Route.useLoaderData();
  const { start } = Route.useSearch();
  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader title="New video" />
      <Composer key={start ?? "new"} kind="video" data={data} />
    </AppShell>
  );
}
