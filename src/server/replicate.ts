import { env } from "cloudflare:workers";
import { integrationFetch, integrationStatus, type GatewayCallFor } from "@every-app/sdk/server";
import { AppError } from "./errors";

// The model service, reached through the Gateway's replicate capability: the
// Gateway holds the key and adds it to each call.
const API = "https://api.replicate.com/v1";
const PROVIDER = "replicate";

export type Target = GatewayCallFor | undefined;

export interface ServiceStatus {
  ready: boolean;
  /** What an admin must do, when not ready. */
  setup: string | null;
}

export async function serviceStatus(target?: Target): Promise<ServiceStatus> {
  try {
    const status = await integrationStatus({ env, provider: PROVIDER, ...(target ? { for: target } : {}) });
    if (status.ready) return { ready: true, setup: null };
    return { ready: false, setup: setupSentence(status.setup) };
  } catch {
    return { ready: false, setup: setupSentence(null) };
  }
}

function setupSentence(fromGateway: string | null | undefined): string {
  const base = `An admin needs to add a Replicate API token (REPLICATE_API_TOKEN) to the Gateway: everyapp configure ${env.EVERYAPP_APP_ID}.`;
  return fromGateway ?? base;
}

function client(target: Target): typeof fetch {
  return integrationFetch({ env, provider: PROVIDER, ...(target ? { for: target } : {}) });
}

async function failure(response: Response): Promise<Error> {
  let message = `The model service answered ${response.status}.`;
  try {
    const body = (await response.json()) as { detail?: string; message?: string; error?: string; title?: string };
    message = body.detail ?? body.message ?? body.title ?? body.error ?? message;
  } catch {
    // Not JSON: keep the status.
  }
  return new Error(message);
}

/** Hands an input image to the model service and returns the URL a model reads it from. */
export async function uploadInput(
  target: Target,
  bytes: ArrayBuffer,
  contentType: string,
  name: string,
): Promise<string> {
  const form = new FormData();
  form.append("content", new Blob([bytes], { type: contentType }), name);
  const response = await client(target)(`${API}/files`, { method: "POST", body: form });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { urls?: { get?: string } };
  if (!body.urls?.get) throw new Error("The model service didn't accept the image.");
  return body.urls.get;
}

export interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
}

export async function createPrediction(
  target: Target,
  model: string,
  input: Record<string, unknown>,
): Promise<Prediction> {
  const response = await client(target)(`${API}/models/${model}/predictions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as Prediction;
}

export async function getPrediction(target: Target, id: string): Promise<Prediction> {
  const response = await client(target)(`${API}/predictions/${encodeURIComponent(id)}`);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as Prediction;
}

/** The output URLs of a finished prediction: a URL, or a list of them. */
export function outputUrls(output: unknown): string[] {
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) return output.filter((item): item is string => typeof item === "string");
  return [];
}

/** Downloads one output: an https URL, or a data: URL. */
export async function fetchOutput(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!match) throw new Error("The model returned an unreadable file.");
    const data = match[2] ? Uint8Array.from(atob(match[3]!), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]!));
    return { bytes: data, contentType: match[1] ?? null };
  }
  if (!url.startsWith("https://")) throw new Error("The model returned an unreadable file.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the result (${response.status}).`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
}

export function serviceUnavailable(status: ServiceStatus): AppError {
  return new AppError(503, status.setup ?? "The model service isn't set up.");
}
