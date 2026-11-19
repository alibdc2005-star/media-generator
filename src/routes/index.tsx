import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Composer } from "@/client/studio/Composer";
import { StudioNav } from "@/client/studio/StudioNav";
import { getComposer } from "@/serverFunctions/studio";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ ref: z.string().optional() }),
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: ({ deps }) => getComposer({ data: { assetId: deps.ref } }),
  head: () => ({ meta: [{ title: "New image · Media Generator" }] }),
  component: ImagePage,
});

function ImagePage() {
  const data = Route.useLoaderData();
  const { ref } = Route.useSearch();
  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader title="New image" />
      <Composer key={ref ?? "new"} kind="image" data={data} />
    </AppShell>
  );
}
