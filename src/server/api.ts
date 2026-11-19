import { env } from "cloudflare:workers";
import { getEveryAppUser } from "@every-app/sdk/server";
import { AppError } from "./errors";
import { viewerFrom, type Viewer } from "./users";

/** Runs a JSON route as the signed-in member; refusals become their status and sentence. */
export async function asViewer(
  request: Request,
  work: (viewer: Viewer) => Promise<Response>,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "Sign in through the Gateway." }, { status: 401 });
  try {
    return await work(await viewerFrom(user));
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "Send a JSON body.");
  }
}
