import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { syncAllPending } from "./server/generations";
import { tools } from "./tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401), and serves the tools.
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request), {
  tools,
});

export default {
  fetch: app.fetch,
  // The minute cron: finishes generations nobody has open.
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncAllPending());
  },
};
