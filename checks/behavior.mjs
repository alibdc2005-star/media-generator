// Behavior: every frozen feature's main path, through the packaged release.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGatewayOptions, fakeCalls, releaseSlowJobs, samplePng } from "./fake-gateway.mjs";
import { json, upload, postJson, settle } from "./lib.mjs";

const runtime = await startRuntime(fakeGatewayOptions());
try {
  // ---- F001 server-side validation ----
  const image = (over = {}) => ({
    kind: "image",
    model: "black-forest-labs/flux-schnell",
    prompt: "A lighthouse on a cliff at dusk, warm light, long exposure",
    aspectRatio: "1:1",
    count: 1,
    ...over,
  });
  for (const [bad, pattern] of [
    [{ prompt: "   " }, /prompt/i],
    [{ prompt: "x".repeat(2001) }, /2000/],
    [{ aspectRatio: "2:1" }, /aspect/i],
    [{ count: 5 }, /1.*4|count|images/i],
    [{ model: "someone/unknown-model" }, /model/i],
  ]) {
    const response = await postJson(runtime, "member", "/api/generations", image(bad));
    expect(response.status, JSON.stringify(bad).slice(0, 80)).toBe(400);
    expect((await json(response)).error).toMatch(pattern);
  }

  // ---- Uploads (F001, F002, F004) ----
  const uploaded = await upload(runtime, "member", samplePng());
  expect(uploaded.status).toBe(201);
  const reference = (await json(uploaded)).asset;
  expect(reference.type).toBe("upload");
  const wrongType = await upload(runtime, "member", Buffer.from("plain words"), "text/plain", "notes.txt");
  expect(wrongType.status).toBe(400);
  const huge = Buffer.concat([samplePng(), Buffer.alloc(10 * 1024 * 1024 + 10)]);
  const tooBig = await upload(runtime, "member", huge);
  expect([400, 413]).toContain(tooBig.status);
  expect((await json(tooBig)).error).toMatch(/10 ?MB/i);

  // A reference on a model that takes none is refused.
  const noRef = await postJson(runtime, "member", "/api/generations", image({ inputAssetId: reference.id }));
  expect(noRef.status).toBe(400);

  // ---- F001 + F003: image with a reference, two outputs ----
  const created = await postJson(
    runtime,
    "member",
    "/api/generations",
    image({ model: "black-forest-labs/flux-kontext-pro", aspectRatio: "16:9", count: 2, inputAssetId: reference.id }),
  );
  expect(created.status).toBe(201);
  const job = (await json(created)).generation;
  expect(["queued", "running"]).toContain(job.status);
  expect(job.kind).toBe("image");
  expect(job.settings).toMatchObject({ aspectRatio: "16:9", count: 2 });
  expect(job.inputAssetId).toBe(reference.id);
  const done = await settle(runtime, "member", job.id);
  expect(done.generation.status).toBe("succeeded");
  expect(done.generation.finishedAt).toBeTruthy();
  expect(done.assets).toHaveLength(2);
  const calls = await fakeCalls(runtime);
  const sent = calls.filter((c) => c.path.endsWith("/flux-kontext-pro/predictions")).map((c) => JSON.parse(c.body).input);
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({ aspect_ratio: "16:9" });
  expect(sent[0].input_image).toMatch(/^https:\/\//);
  const media = await runtime.fetch(`/media/${done.assets[0].id}`, { role: "member" });
  expect(media.status).toBe(200);
  expect(media.headers.get("content-type")).toBe("image/png");
  const download = await runtime.fetch(`/media/${done.assets[0].id}?download=1`, { role: "member" });
  expect(download.headers.get("content-disposition")).toMatch(/attachment/);

  // Regenerate submits the same settings again.
  const again = await runtime.fetch(`/api/generations/${job.id}/regenerate`, { role: "member", method: "POST" });
  expect(again.status).toBe(201);
  const second = (await json(again)).generation;
  expect(second.id).not.toBe(job.id);
  expect(second).toMatchObject({ model: job.model, prompt: job.prompt, settings: job.settings, inputAssetId: reference.id });
  await settle(runtime, "member", second.id);

  // ---- F002: video from a start image, and the model's duration limit ----
  const tooLong = await postJson(runtime, "member", "/api/generations", {
    kind: "video", model: "luma/ray-flash-2-540p", prompt: "Waves roll in", aspectRatio: "16:9", duration: 10,
  });
  expect(tooLong.status).toBe(400);
  expect((await json(tooLong)).error).toMatch(/duration|seconds/i);
  const badRatio = await postJson(runtime, "member", "/api/generations", {
    kind: "video", model: "bytedance/seedance-1-lite", prompt: "Waves roll in", aspectRatio: "4:3", duration: 5,
  });
  expect(badRatio.status).toBe(400);
  const videoCreated = await postJson(runtime, "member", "/api/generations", {
    kind: "video", model: "bytedance/seedance-1-lite", prompt: "The camera slowly pushes in as the light flickers",
    aspectRatio: "16:9", duration: 10, inputAssetId: done.assets[0].id,
  });
  expect(videoCreated.status).toBe(201);
  const videoJob = (await json(videoCreated)).generation;
  expect(videoJob.settings).toMatchObject({ aspectRatio: "16:9", duration: 10 });
  const videoDone = await settle(runtime, "member", videoJob.id);
  expect(videoDone.generation.status).toBe("succeeded");
  expect(videoDone.assets).toHaveLength(1);
  expect(videoDone.assets[0].type).toBe("video");
  const clip = await runtime.fetch(`/media/${videoDone.assets[0].id}`, { role: "member" });
  expect(clip.headers.get("content-type")).toBe("video/mp4");
  const videoInput = (await fakeCalls(runtime)).filter((c) => c.path.endsWith("/seedance-1-lite/predictions")).map((c) => JSON.parse(c.body).input)[0];
  expect(videoInput).toMatchObject({ duration: 10 });
  expect(videoInput.image).toMatch(/^https:\/\//);

  // ---- F003: failure, retry, pending cap ----
  const flaky = await postJson(runtime, "member", "/api/generations", image({ prompt: "A flaky neon street market in the rain" }));
  const flakyJob = (await json(flaky)).generation;
  const failed = await settle(runtime, "member", flakyJob.id);
  expect(failed.generation.status).toBe("failed");
  expect(failed.generation.error).toMatch(/could not finish/);
  const retried = await runtime.fetch(`/api/generations/${flakyJob.id}/retry`, { role: "member", method: "POST" });
  expect(retried.status).toBe(200);
  expect((await settle(runtime, "member", flakyJob.id)).generation.status).toBe("succeeded");
  const notFailed = await runtime.fetch(`/api/generations/${job.id}/retry`, { role: "member", method: "POST" });
  expect(notFailed.status).toBe(409);

  const slow = [];
  for (let i = 0; i < 4; i++) {
    const response = await postJson(runtime, "owner", "/api/generations", image({ prompt: `A slow sunrise over hills, take ${i + 1}` }));
    expect(response.status).toBe(201);
    slow.push((await json(response)).generation.id);
  }
  const fifth = await postJson(runtime, "owner", "/api/generations", image({ prompt: "A slow fifth sunrise" }));
  expect(fifth.status).toBe(429);
  expect((await json(fifth)).error).toMatch(/4/);
  const list = await json(await runtime.fetch("/api/generations", { role: "owner" }));
  expect(list.generations.map((g) => g.id)).toEqual([...slow].reverse());
  expect(list.generations.every((g) => ["queued", "running"].includes(g.status))).toBe(true);
  await releaseSlowJobs(runtime);
  // A background pass finishes jobs nobody is watching.
  await runtime.scheduled("* * * * *");
  const after = await json(await runtime.fetch("/api/generations", { role: "owner" }));
  expect(after.generations.every((g) => g.status === "succeeded")).toBe(true);

  // ---- F004: library filters, pagination, delete ----
  const videos = await json(await runtime.fetch("/api/assets?type=video", { role: "member" }));
  expect(videos.assets.length).toBe(1);
  expect(videos.assets.every((a) => a.type === "video")).toBe(true);
  const uploads = await json(await runtime.fetch("/api/assets?type=upload", { role: "member" }));
  expect(uploads.assets.map((a) => a.id)).toEqual([reference.id]);
  const all = await json(await runtime.fetch("/api/assets?type=all", { role: "member" }));
  expect(all.total).toBe(7);
  const page2 = await json(await runtime.fetch("/api/assets?type=all&limit=3&page=2", { role: "member" }));
  expect(page2.assets.map((a) => a.id)).toEqual(all.assets.slice(3, 6).map((a) => a.id));
  const times = all.assets.map((a) => a.createdAt);
  expect([...times].sort().reverse()).toEqual(times);
  const detail = await json(await runtime.fetch(`/api/assets/${done.assets[0].id}`, { role: "member" }));
  expect(detail.asset).toMatchObject({ prompt: job.prompt, model: job.model, settings: { aspectRatio: "16:9" } });

  // ---- Browser journey (member) ----
  const context = await runtime.context("member");
  const page = await context.newPage();
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByTestId("model-select").click();
  await page.getByRole("option", { name: /Flux 1\.1 Pro/ }).click();
  await page.getByTestId("prompt").fill("Paper lanterns drifting over a mountain lake at twilight");
  await page.getByTestId("aspect-4:3").click();
  await page.getByTestId("count-2").click();
  await page.getByTestId("pick-reference").click();
  await page.getByTestId(`pick-${reference.id}`).click();
  await expect(page.getByTestId("reference-preview")).toBeVisible();
  await Promise.all([page.waitForURL(/\/generations\/[\w-]+$/), page.getByTestId("submit-generation").click()]);
  await expect(page.getByTestId("generation-status")).toHaveText(/Succeeded/, { timeout: 20_000 });
  await expect(page.getByTestId("result-asset")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Download" }).first()).toHaveAttribute("href", /\/media\/[\w-]+\?download=1$/);
  const firstResult = page.url();
  await Promise.all([
    page.waitForURL((url) => url.href !== firstResult && /\/generations\/[\w-]+$/.test(url.pathname)),
    page.getByTestId("regenerate").click(),
  ]);
  await expect(page.getByTestId("generation-status")).toHaveText(/Succeeded/, { timeout: 20_000 });
  const lanternsResult = page.url();

  // Generations list
  await page.goto("/generations");
  await expect(page.getByTestId("generation-row").filter({ hasText: "Paper lanterns" })).toHaveCount(2);
  await expect(page.getByTestId("generation-row").first()).toContainText("Paper lanterns");
  await expect(page.getByTestId("generation-row").filter({ hasText: "flaky neon" })).toContainText("Succeeded");

  // Video: the start frame comes from the library
  await page.goto(`/library/${done.assets[0].id}`);
  await expect(page.getByTestId("asset-media")).toBeVisible();
  await expect(page.getByText(job.prompt)).toBeVisible();
  await Promise.all([page.waitForURL(/\/video/), page.getByTestId("use-as-start").click()]);
  await expect(page.getByTestId("start-preview")).toBeVisible();
  await page.getByTestId("prompt").fill("Lanterns rise slowly as the water ripples");
  await page.getByTestId("duration-5").click();
  await Promise.all([page.waitForURL(/\/generations\/[\w-]+$/), page.getByTestId("submit-generation").click()]);
  await expect(page.getByTestId("generation-status")).toHaveText(/Succeeded/, { timeout: 20_000 });
  await expect(page.locator("video[data-testid='result-video']")).toHaveCount(1);

  // Library: filter, open, delete
  await page.goto("/library");
  await page.getByTestId("filter-video").click();
  await expect(page.getByTestId("asset-card")).toHaveCount(2);
  await page.getByTestId("asset-card").last().click();
  await expect(page.locator("video[data-testid='asset-media']")).toBeVisible();
  await page.getByTestId("delete-asset").click();
  await Promise.all([page.waitForURL(/\/library$/), page.getByRole("button", { name: "Delete", exact: true }).click()]);
  const remaining = await json(await runtime.fetch("/api/assets?type=video", { role: "member" }));
  expect(remaining.assets).toHaveLength(1);
  const deletedMedia = await runtime.fetch(`/media/${videoDone.assets[0].id}`, { role: "member" });
  expect(deletedMedia.status).toBe(404);

  // ---- F005: the admin's view ----
  const ownerContext = await runtime.context("owner");
  const adminPage = await ownerContext.newPage();
  await adminPage.goto("/admin");
  await expect(adminPage.getByTestId("admin-asset-row").filter({ hasText: "member@example.test" }).first()).toBeVisible();
  await expect(adminPage.getByTestId("admin-asset-row").filter({ hasText: "owner@example.test" }).first()).toBeVisible();
  await adminPage.close();

  // Phone-sized smoke
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  await small.goto("/");
  await expect(small.getByTestId("submit-generation")).toBeVisible();
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await small.goto("/library");
  await expect(small.getByTestId("asset-card").first()).toBeVisible();
  await phone.close();

  // The public picture: a finished generation with its images.
  await page.goto(lanternsResult);
  await expect(page.getByTestId("result-asset")).toHaveCount(2);
  await expect(page.getByTestId("result-asset").locator("img").first()).toBeVisible();
  await runtime.screenshot(page);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
