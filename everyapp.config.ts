import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "media-generator",
  name: "Media Generator",
  description: "Make images and short videos from text prompts and keep them in a private library.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Generated images and videos, and uploaded reference images.
    r2: ["media"],
  },
  capabilities: {
    replicate: {
      access: "read",
      why: "Runs the image and video models. Billed by Replicate per generation.",
    },
  },
  features: {
    models: {
      name: "Image and video models",
      why: "Generating anything needs a Replicate account.",
      steps: [
        "Create a Replicate account and add billing: https://replicate.com/account/billing",
        "Create an API token: https://replicate.com/account/api-tokens",
      ],
      capabilities: ["replicate"],
    },
  },
});
