import { describe, expect, it } from "vitest";
import { modelInput, validateGeneration } from "./models";

const image = {
  kind: "image",
  model: "black-forest-labs/flux-kontext-pro",
  prompt: "  A red kite over dunes  ",
  aspectRatio: "3:4",
  count: 3,
};

describe("validateGeneration", () => {
  it("keeps the settings and trims the prompt", () => {
    expect(validateGeneration(image)).toEqual({
      kind: "image",
      model: "black-forest-labs/flux-kontext-pro",
      prompt: "A red kite over dunes",
      settings: { aspectRatio: "3:4", count: 3 },
      inputAssetId: null,
    });
  });

  it("refuses empty and long prompts, odd ratios and counts", () => {
    expect(() => validateGeneration({ ...image, prompt: " " })).toThrow(/prompt/);
    expect(() => validateGeneration({ ...image, prompt: "a".repeat(2001) })).toThrow(/2000/);
    expect(() => validateGeneration({ ...image, aspectRatio: "21:9" })).toThrow(/aspect/);
    expect(() => validateGeneration({ ...image, count: 0 })).toThrow(/1 and 4/);
    expect(() => validateGeneration({ ...image, model: "x/y" })).toThrow(/model/);
  });

  it("refuses a reference for a model without one", () => {
    expect(() =>
      validateGeneration({ ...image, model: "google/imagen-4", inputAssetId: "a" }),
    ).toThrow(/reference/);
  });

  it("limits video durations to the model's", () => {
    const video = { kind: "video", model: "luma/ray-flash-2-540p", prompt: "Rain", aspectRatio: "9:16" };
    expect(validateGeneration({ ...video, duration: 5 }).settings).toEqual({ aspectRatio: "9:16", duration: 5 });
    expect(() => validateGeneration({ ...video, duration: 10 })).toThrow(/5 seconds/);
    expect(() => validateGeneration({ ...video, aspectRatio: "4:3", duration: 5 })).toThrow(/aspect/);
  });

  it("names the model's own inputs", () => {
    const video = validateGeneration({ kind: "video", model: "kwaivgi/kling-v1.6-standard", prompt: "Rain", aspectRatio: "1:1", duration: 10 });
    expect(modelInput(video, "https://x/y")).toEqual({ prompt: "Rain", aspect_ratio: "1:1", duration: 10, start_image: "https://x/y" });
  });
});
