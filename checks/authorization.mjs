// Authorization: who may open, read and change what. Runs against a Gateway
// with nothing configured, as a fresh install has.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { samplePng } from "./fake-gateway.mjs";
import { json, upload, postJson } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/video", "/generations", "/library", "/api/assets", "/api/generations"]);

  // Anonymous callers and other organizations reach nothing.
  for (const role of [undefined, "outsider"]) {
    for (const [method, path] of [["GET", "/admin"], ["GET", "/api/admin/assets"], ["POST", "/api/uploads"], ["POST", "/api/generations"], ["GET", "/media/anything"]]) {
      const response = await runtime.fetch(path, { role, method });
      expect([401, 403], `${role ?? "anonymous"} ${method} ${path}`).toContain(response.status);
    }
  }

  // No sign-in of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout"]) {
    const response = await runtime.fetch(path, { role: "member" });
    expect(response.status, path).toBe(404);
    expect(await response.text()).not.toMatch(/type="password"/);
  }

  // Each member's uploads are their own.
  const mine = await json(await upload(runtime, "member", samplePng()));
  const ownerUpload = await json(await upload(runtime, "owner", samplePng()));
  expect(mine.asset.id).toBeTruthy();

  // A second ordinary member, signed by the same Gateway.
  const other = await runtime.token({ subject: { sub: "member-two", email: "two@example.test", orgRole: "member" } });
  const asOther = (path, init = {}) =>
    runtime.mf.dispatchFetch(`http://${runtime.hostname}${path}`, {
      redirect: "manual",
      ...init,
      headers: { "x-everyapp-identity": other, ...(init.headers ?? {}) },
    });
  expect((await asOther("/api/assets")).status).toBe(200);
  expect((await json(await asOther("/api/assets"))).assets).toHaveLength(0);
  expect((await asOther(`/media/${mine.asset.id}`)).status).toBe(404);
  expect((await asOther(`/api/assets/${mine.asset.id}`)).status).toBe(404);
  expect((await asOther(`/api/assets/${mine.asset.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await asOther("/api/admin/assets")).status).toBe(403);
  expect((await asOther(`/api/assets/${ownerUpload.asset.id}`, { method: "DELETE" })).status).toBe(404);

  // The member can't see or remove the owner's things either.
  expect((await runtime.fetch(`/media/${ownerUpload.asset.id}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/assets/${ownerUpload.asset.id}`, { role: "member", method: "DELETE" })).status).toBe(404);
  const memberList = await json(await runtime.fetch("/api/assets", { role: "member" }));
  expect(memberList.assets.map((a) => a.id)).toEqual([mine.asset.id]);

  // Generations are private too.
  const db = await runtime.database();
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO generations (id, user_id, kind, model, prompt, settings, status, error, prediction_ids, created_at) VALUES (?, ?, 'image', 'black-forest-labs/flux-schnell', 'A quiet harbour', '{\"aspectRatio\":\"1:1\",\"count\":1}', 'failed', 'Out of capacity', '[]', ?)")
    .bind("gen-member-1", "member", now)
    .run();
  expect((await runtime.fetch("/api/generations/gen-member-1", { role: "member" })).status).toBe(200);
  expect((await asOther("/api/generations/gen-member-1")).status).toBe(404);
  expect((await asOther("/api/generations/gen-member-1/retry", { method: "POST" })).status).toBe(404);
  expect((await asOther("/api/generations/gen-member-1/regenerate", { method: "POST" })).status).toBe(404);
  expect((await json(await asOther("/api/generations"))).generations).toHaveLength(0);

  // A start image or reference must be the member's own.
  const borrowed = await postJson(runtime, "member", "/api/generations", {
    kind: "video", model: "bytedance/seedance-1-lite", prompt: "Gentle drift", aspectRatio: "16:9", duration: 5, inputAssetId: ownerUpload.asset.id,
  });
  expect([400, 404]).toContain(borrowed.status);

  // Without the model service, submitting is refused and the form says what to set.
  const unconfigured = await postJson(runtime, "member", "/api/generations", {
    kind: "image", model: "black-forest-labs/flux-schnell", prompt: "A quiet harbour", aspectRatio: "1:1", count: 1,
  });
  expect(unconfigured.status).toBe(503);
  const page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("setup-notice")).toContainText("REPLICATE_API_TOKEN");
  await expect(page.getByTestId("submit-generation")).toBeDisabled();
  await page.goto("/video");
  await expect(page.getByTestId("setup-notice")).toBeVisible();
  await expect(page.getByTestId("submit-generation")).toBeDisabled();

  // Admin moderation: members are refused, the admin sees and removes anything.
  expect((await runtime.fetch("/api/admin/assets", { role: "member" })).status).toBe(403);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-asset-row")).toHaveCount(0);
  await expect(page.getByText(/admin/i).first()).toBeVisible();
  const adminList = await json(await runtime.fetch("/api/admin/assets", { role: "owner" }));
  const row = adminList.assets.find((a) => a.id === mine.asset.id);
  expect(row.ownerEmail).toBe("member@example.test");
  expect((await runtime.fetch(`/media/${mine.asset.id}`, { role: "owner" })).status).toBe(200);
  const removed = await runtime.fetch(`/api/assets/${mine.asset.id}`, { role: "owner", method: "DELETE" });
  expect(removed.status).toBe(200);
  expect((await runtime.fetch(`/media/${mine.asset.id}`, { role: "member" })).status).toBe(404);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
