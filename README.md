# Media Generator

Make images and short videos from text prompts, or from an image you start with, and keep everything you make in a private library. Each member sees only their own work; organization admins can review and remove anything.

Inspired by https://higgsfield.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Generate 1 to 4 images from a prompt with a chosen model and aspect ratio, optionally guided by a reference image.
- Generate a 5 or 10 second video from a prompt or from a start image.
- Follow each job's status, retry failed ones and regenerate finished ones, with up to 4 running at once.
- Browse, filter, download and delete your images, videos and uploads.
- As an admin, see every member's assets and delete any of them.

Left out: accounts and sign-in, which your Gateway handles; plans and credits; multi-scene studios; editing, upscaling and effects; audio; community and publishing; the developer API and other side products; models Replicate doesn't host.

## Setup

```sh
pnpm install
pnpm dev            # run locally behind the dev Gateway
pnpm test           # unit tests
pnpm run deploy     # deploy to your Cloudflare account behind your Gateway
```

Anyone can also install a release with `pnpm everyapp install <repository url>`.

The app stores records in D1 and files in an R2 bucket, both created by the deploy (R2 must be enabled on the Cloudflare account once). It has no secrets or settings of its own.

Generating needs the Gateway's Replicate capability: create an API token at https://replicate.com/account/api-tokens and set it with `pnpm everyapp configure media-generator` (`REPLICATE_API_TOKEN`). Until it's set, the library works and the generate forms say what to set.

The checks in `checks/` run against a packaged release with a local stand-in for Replicate. Real Replicate calls and a live deployment weren't part of them.

## Limitations

- Replicate bills each generation to the token's account; the app doesn't meter or cap spend beyond 4 running jobs per member.
- Model inputs follow Replicate's published schemas for the listed models; if a model changes its inputs, its jobs fail with Replicate's error.
- Finished jobs are picked up when someone opens them, or by the once-a-minute background pass.
