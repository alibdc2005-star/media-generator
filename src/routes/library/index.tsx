import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Media } from "@/client/studio/Media";
import { Pager } from "@/client/studio/Pager";
import { StudioNav } from "@/client/studio/StudioNav";
import { getLibrary } from "@/serverFunctions/studio";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "upload", label: "Uploads" },
] as const;

export const Route = createFileRoute("/library/")({
  validateSearch: z.object({
    type: z.enum(["all", "image", "video", "upload"]).optional(),
    page: z.number().int().min(1).optional(),
  }),
  loaderDeps: ({ search }) => ({ type: search.type ?? "all", page: search.page ?? 1 }),
  loader: ({ deps }) => getLibrary({ data: deps }),
  head: () => ({ meta: [{ title: "Library · Media Generator" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const library = Route.useLoaderData();
  const { type = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AppShell nav={<StudioNav />}>
      <PageHeader title="Library" />
      <Tabs value={type} onValueChange={(value) => void navigate({ search: { type: value as typeof type } })}>
        <TabsList>
          {FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} data-testid={`filter-${filter.value}`}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {library.items.length === 0 ? (
        type === "all" ? (
          <EmptyState
            title="Your library is empty"
            description="Generated images and videos, and images you upload, are kept here."
            action={
              <Link to="/" className={buttonVariants()}>
                New image
              </Link>
            }
          />
        ) : (
          <EmptyState kind="filtered" title={`No ${FILTERS.find((f) => f.value === type)!.label.toLowerCase()} yet`} />
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {library.items.map((asset) => (
            <Link
              key={asset.id}
              to="/library/$id"
              params={{ id: asset.id }}
              data-testid="asset-card"
              className="group relative block overflow-hidden rounded-lg border border-border bg-card"
            >
              <Media asset={asset} className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]" />
              {asset.type !== "image" ? (
                <Badge variant="secondary" className="absolute top-2 left-2">
                  {asset.type === "video" ? "Video" : "Upload"}
                </Badge>
              ) : null}
            </Link>
          ))}
        </div>
      )}
      <Pager
        page={library.page}
        pageCount={library.pageCount}
        onPage={(page) => void navigate({ search: (prev) => ({ ...prev, page }) })}
      />
    </AppShell>
  );
}
