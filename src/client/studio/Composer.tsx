import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { EmptyState } from "@/client/components/EmptyState";
import type { AssetView } from "@/server/assets";
import {
  IMAGE_COUNTS,
  IMAGE_MODELS,
  IMAGE_RATIOS,
  PROMPT_LIMIT,
  VIDEO_MODELS,
  VIDEO_RATIOS,
} from "@/server/models";
import { submitGeneration } from "@/serverFunctions/studio";
import { errorText } from "./format";
import { Media } from "./Media";

const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const UPLOAD_LIMIT = 10 * 1024 * 1024;

interface ComposerData {
  status: { ready: boolean; setup: string | null };
  pickable: AssetView[];
  selected: AssetView | null;
}

export function Composer({ kind, data }: { kind: "image" | "video"; data: ComposerData }) {
  const navigate = useNavigate();
  const models = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const ratios: readonly string[] = kind === "image" ? IMAGE_RATIOS : VIDEO_RATIOS;
  const takesImage = (id: string) =>
    kind === "video" || Boolean(IMAGE_MODELS.find((m) => m.id === id)?.referenceParam);
  const [model, setModel] = useState(() =>
    data.selected ? models.find((m) => takesImage(m.id))!.id : models[0]!.id,
  );
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(ratios[0]!);
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(5);
  const [image, setImage] = useState<AssetView | null>(data.selected);
  const [pickable, setPickable] = useState(data.pickable);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const durations = VIDEO_MODELS.find((m) => m.id === model)?.durations ?? [5];
  const imageAllowed = takesImage(model);
  const imageWord = kind === "image" ? "reference" : "start";
  const disabled = !data.status.ready;

  function chooseModel(id: string) {
    setModel(id);
    const allowed = VIDEO_MODELS.find((m) => m.id === id)?.durations;
    if (allowed && !allowed.includes(duration)) setDuration(allowed[0]!);
  }

  async function uploadFile(file: File) {
    setError(null);
    if (!UPLOAD_TYPES.includes(file.type)) return setError("Upload a PNG, JPEG or WebP image.");
    if (file.size > UPLOAD_LIMIT) return setError("Images can be at most 10 MB.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const body = (await response.json()) as { asset?: AssetView; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error ?? "The upload failed.");
      setImage(body.asset);
      setPickable((list) => [body.asset!, ...list]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!prompt.trim()) return setError("Write a prompt.");
    setSubmitting(true);
    try {
      const generation = await submitGeneration({
        data: {
          kind,
          model,
          prompt,
          aspectRatio,
          ...(kind === "image" ? { count } : { duration }),
          inputAssetId: imageAllowed && image ? image.id : null,
        },
      });
      await navigate({ to: "/generations/$id", params: { id: generation.id } });
    } catch (cause) {
      setError(errorText(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {disabled ? (
        <Alert data-testid="setup-notice">
          <AlertTitle>Generation isn't set up yet</AlertTitle>
          <AlertDescription>{data.status.setup}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={submit}>
        <fieldset disabled={disabled} className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="prompt">{kind === "video" && image ? "Motion prompt" : "Prompt"}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {prompt.length}/{PROMPT_LIMIT}
              </span>
            </div>
            <Textarea
              id="prompt"
              data-testid="prompt"
              value={prompt}
              maxLength={PROMPT_LIMIT}
              rows={4}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                kind === "image"
                  ? "A cabin in a snowy pine forest, morning light"
                  : "A drone shot gliding over a coastline at sunset"
              }
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={model}
                onValueChange={(value) => value && chooseModel(value)}
                items={models.map((m) => ({ value: m.id, label: m.label }))}
              >
                <SelectTrigger className="w-full" data-testid="model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[aspectRatio]}
                onValueChange={(value: string[]) => value[0] && setAspectRatio(value[0])}
                className="flex-wrap"
              >
                {ratios.map((ratio) => (
                  <ToggleGroupItem key={ratio} value={ratio} data-testid={`aspect-${ratio}`}>
                    {ratio}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {kind === "image" ? (
              <div className="space-y-2">
                <Label>Images</Label>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[String(count)]}
                  onValueChange={(value: string[]) => value[0] && setCount(Number(value[0]))}
                >
                  {IMAGE_COUNTS.map((n) => (
                    <ToggleGroupItem key={n} value={String(n)} data-testid={`count-${n}`}>
                      {n}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Duration</Label>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[String(duration)]}
                  onValueChange={(value: string[]) => value[0] && setDuration(Number(value[0]))}
                >
                  {[5, 10].map((seconds) => (
                    <ToggleGroupItem
                      key={seconds}
                      value={String(seconds)}
                      disabled={!durations.includes(seconds)}
                      data-testid={`duration-${seconds}`}
                    >
                      {seconds} s
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{kind === "image" ? "Reference image" : "Start image"}</Label>
            {!imageAllowed ? (
              <p className="text-sm text-muted-foreground">This model doesn't take a reference image.</p>
            ) : image ? (
              <Card size="sm">
                <CardContent className="flex items-center gap-3">
                  <Media
                    asset={image}
                    className="size-16 rounded-md object-cover"
                    testId={`${imageWord}-preview`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {image.prompt ?? "Uploaded image"}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove image" onClick={() => setImage(null)}>
                    <X />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  pending={uploading}
                  onClick={() => fileInput.current?.click()}
                  data-testid={`upload-${imageWord}`}
                >
                  <Upload data-icon="inline-start" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPicking(true)}
                  data-testid={`pick-${imageWord}`}
                >
                  <ImagePlus data-icon="inline-start" />
                  From library
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={UPLOAD_TYPES.join(",")}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
              </div>
            )}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription data-testid="form-error">{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" pending={submitting} disabled={disabled} data-testid="submit-generation">
            {kind === "image" ? "Generate images" : "Generate video"}
          </Button>
        </fieldset>
      </form>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose an image</DialogTitle>
          </DialogHeader>
          {pickable.length ? (
            <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {pickable.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="overflow-hidden rounded-md border border-border transition-colors hover:border-primary focus-visible:border-ring focus-visible:outline-none"
                  data-testid={`pick-${asset.id}`}
                  onClick={() => {
                    setImage(asset);
                    setPicking(false);
                  }}
                >
                  <Media asset={asset} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No images yet" description="Upload one, or generate some first." variant="plain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
