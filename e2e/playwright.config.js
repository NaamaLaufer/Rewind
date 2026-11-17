// E2E against the running stack (docker compose -f docker-compose.dev.yml up -d) on :3000.
// Two Chromium projects with a FAKE camera:
//   face   -> plays e2e/fixtures/face.y4m (a real person looking at the camera)
//   noface -> Chrome's built-in synthetic pattern (no face in it)
import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const faceFile = fileURLToPath(new URL("./fixtures/face.y4m", import.meta.url));
const baseArgs = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"];

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    permissions: ["camera"],
    locale: "he-IL",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "face",
      testIgnore: /noface\.spec/,
      use: {
        launchOptions: {
          args: existsSync(faceFile) ? [...baseArgs, `--use-file-for-fake-video-capture=${faceFile}`] : baseArgs,
        },
      },
    },
    { name: "noface", testMatch: /noface\.spec/, use: { launchOptions: { args: baseArgs } } },
  ],
});
