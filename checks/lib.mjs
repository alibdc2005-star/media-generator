import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

export async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON (${response.status}): ${text.slice(0, 300)}`);
  }
}

export async function upload(runtime, role, bytes, type = "image/png", name = "reference.png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return runtime.fetch("/api/uploads", { role, method: "POST", body: form });
}

export function postJson(runtime, role, path, body) {
  return runtime.fetch(path, {
    role,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Polls a generation until it leaves queued and running. */
export async function settle(runtime, role, id, tries = 40) {
  let last;
  for (let i = 0; i < tries; i++) {
    const response = await runtime.fetch(`/api/generations/${id}`, { role });
    expect(response.status).toBe(200);
    const body = await json(response);
    last = body.generation;
    if (body.generation.status === "succeeded" || body.generation.status === "failed") return body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Generation ${id} never finished: ${JSON.stringify(last)}`);
}
