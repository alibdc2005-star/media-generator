import { Link, useRouterState } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Image" },
  { to: "/video", label: "Video" },
  { to: "/generations", label: "Generations" },
  { to: "/library", label: "Library" },
] as const;

/** The app's sections, in the AppShell bar. */
export function StudioNav() {
  const admin = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return Boolean(root && "admin" in root && root.admin);
    },
  });
  const links = admin ? [...LINKS, { to: "/admin", label: "All assets" } as const] : LINKS;
  return (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/", includeSearch: false }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
