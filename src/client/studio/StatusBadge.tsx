import { Badge } from "@/client/components/ui/badge";

const STYLES = {
  queued: { variant: "secondary", label: "Queued" },
  running: { variant: "info", label: "Running" },
  succeeded: { variant: "success", label: "Succeeded" },
  failed: { variant: "destructive", label: "Failed" },
} as const;

export function StatusBadge({ status, testId }: { status: keyof typeof STYLES; testId?: string }) {
  const style = STYLES[status];
  return (
    <Badge variant={style.variant} data-testid={testId}>
      {style.label}
    </Badge>
  );
}

export const isPending = (status: string) => status === "queued" || status === "running";
