// Persistence: generations, assets and their files outlive a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGatewayOptions, samplePng } from "./fake-gateway.mjs";
import { json, upload, postJson, settle } from "./lib.mjs";

const runtime = await startRuntime(fakeGatewayOptions());
try {
  const uploaded = (await json(await upload(runtime, "member", samplePng()))).asset;
  const created = await postJson(runtime, "member", "/api/generations", {
    kind: "image", model: "black-forest-labs/flux-schnell", prompt: "An orchard in spring fog", aspectRatio: "3:4", count: 1,
  });
  expect(created.status).toBe(201);
  const id = (await json(created)).generation.id;
  const done = await settle(runtime, "member", id);
  expect(done.generation.status).toBe("succeeded");
  const bytes = Buffer.from(await (await runtime.fetch(`/media/${done.assets[0].id}`, { role: "member" })).arrayBuffer());

  await runtime.restart();

  const after = await json(await runtime.fetch(`/api/generations/${id}`, { role: "member" }));
  expect(after.generation).toMatchObject({ status: "succeeded", prompt: "An orchard in spring fog", settings: { aspectRatio: "3:4", count: 1 } });
  const assets = await json(await runtime.fetch("/api/assets", { role: "member" }));
  expect(assets.assets.map((a) => a.id).sort()).toEqual([uploaded.id, done.assets[0].id].sort());
  const again = Buffer.from(await (await runtime.fetch(`/media/${done.assets[0].id}`, { role: "member" })).arrayBuffer());
  expect(again.equals(bytes)).toBe(true);
  const original = await runtime.fetch(`/media/${uploaded.id}`, { role: "member" });
  expect(original.status).toBe(200);
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
