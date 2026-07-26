import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],

  // The writer shells out to the Claude CLI (lib/pipeline/write.ts uses
  // spawn/spawnSync), and the tracer cannot know what a subprocess will need,
  // so it falls back to tracing the whole project. These are the directories it
  // sweeps up that no route ever imports: a separate daemon, an Xcode project,
  // standalone scripts, docs, tests, and rendered post images.
  outputFileTracingExcludes: {
    "/*": [
      "./bridge/**/*",
      "./ios/**/*",
      "./scripts/**/*",
      "./docs/**/*",
      "./tests/**/*",
      "./data/renders/**/*",
      "./data/test-renders/**/*",
      "./data/demo/**/*",
    ],
  },
};

export default nextConfig;
