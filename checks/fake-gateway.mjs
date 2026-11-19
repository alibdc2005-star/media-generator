// A local stand-in for the Gateway's replicate capability, so the suites can
// drive a generation end to end without a real model service or key.
import { deflateSync, crc32 } from "node:zlib";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** A soft two-colour gradient PNG, so pictures look like pictures. */
export function gradientPng(width, height, from, to) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const wave = 0.5 + 0.5 * Math.sin((x + y * 0.6) / 18);
      for (let c = 0; c < 3; c++) {
        row[1 + x * 3 + c] = Math.round(from[c] * (1 - t) + to[c] * t) * (0.85 + 0.15 * wave);
      }
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PALETTES = [
  [[255, 138, 76], [94, 63, 190]],
  [[40, 170, 200], [250, 220, 120]],
  [[30, 60, 110], [240, 120, 150]],
  [[90, 200, 140], [20, 70, 90]],
  [[250, 190, 90], [200, 60, 80]],
  [[120, 110, 230], [60, 210, 220]],
];

const images = PALETTES.map(([a, b]) => gradientPng(320, 240, a, b).toString("base64"));
// An ISO BMFF header: enough for the app to store and serve a clip.
const clip = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypmp42", "ascii"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mp42isom", "ascii"),
  Buffer.alloc(64),
]).toString("base64");

const SCRIPT = `
const IMAGES = ${JSON.stringify(images)};
const CLIP = ${JSON.stringify(clip)};
const predictions = new Map();
const calls = [];
const failedOnce = new Set();
let released = false;
let counter = 0;
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__calls") return Response.json(calls);
  if (url.pathname === "/__release") { released = true; return Response.json({ ok: true }); }
  const body = request.method === "GET" ? null : await request.text();
  calls.push({ method: request.method, path: url.pathname, body: body && body.length < 20000 ? body : null });
  if (url.pathname === "/api/integrations/replicate") {
    return Response.json({ requested: true, configured: true, ready: true, settings: [], setup: null, command: null });
  }
  const prefix = "/api/integrations/replicate/api.replicate.com";
  if (!url.pathname.startsWith(prefix)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const path = url.pathname.slice(prefix.length);
  if (request.method === "POST" && path === "/v1/files") {
    const id = "file-" + (++counter);
    return Response.json({ id, urls: { get: "https://api.replicate.com/v1/files/" + id + "/download" } }, { status: 201 });
  }
  const create = /^\\/v1\\/models\\/([^/]+)\\/([^/]+)\\/predictions$/.exec(path);
  if (request.method === "POST" && create) {
    const input = JSON.parse(body).input;
    const id = "pred-" + (++counter);
    const model = create[1] + "/" + create[2];
    const video = /seedance|kling|ray/.test(model);
    let mode = "ok";
    if (/flaky/i.test(input.prompt) && !failedOnce.has(input.prompt)) { failedOnce.add(input.prompt); mode = "fail"; }
    if (/\\bslow\\b/i.test(input.prompt)) mode = "slow";
    predictions.set(id, { id, model, video, mode, index: counter });
    return Response.json({ id, status: "starting", output: null, error: null }, { status: 201 });
  }
  const read = /^\\/v1\\/predictions\\/([^/]+)$/.exec(path);
  if (request.method === "GET" && read) {
    const p = predictions.get(read[1]);
    if (!p) return Response.json({ detail: "Not found" }, { status: 404 });
    if (p.mode === "fail") return Response.json({ id: p.id, status: "failed", output: null, error: "The model could not finish this prompt." });
    if (p.mode === "slow" && !released) return Response.json({ id: p.id, status: "processing", output: null, error: null });
    const output = p.video
      ? "data:video/mp4;base64," + CLIP
      : ["data:image/png;base64," + IMAGES[p.index % IMAGES.length]];
    return Response.json({ id: p.id, status: "succeeded", output, error: null });
  }
  return Response.json({ detail: "Not found" }, { status: 404 });
} };`;

export const FAKE_GATEWAY = "fake-replicate-gateway";

export function fakeGatewayOptions() {
  return {
    bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: FAKE_GATEWAY } },
    workers: [
      {
        config: {
          name: FAKE_GATEWAY,
          compatibilityDate: "2025-01-01",
          manifest: { mainModule: "gateway.mjs", modules: { "gateway.mjs": { type: "esm", contents: SCRIPT } } },
        },
      },
    ],
  };
}

export async function fakeCalls(runtime) {
  return (await (await runtime.mf.getWorker(FAKE_GATEWAY)).fetch("http://fake/__calls")).json();
}

export async function releaseSlowJobs(runtime) {
  await (await runtime.mf.getWorker(FAKE_GATEWAY)).fetch("http://fake/__release");
}

export const samplePng = () => gradientPng(64, 48, [200, 120, 60], [60, 90, 200]);
