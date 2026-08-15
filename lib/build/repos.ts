// The Stride repos the building area can open a session in. This is the
// display copy; scripts/term-relay.mjs carries the enforcement copy — change
// both together.

import os from "node:os";
import path from "node:path";

export interface BuildRepo {
  key: string;
  name: string;
  dir: string;
  note: string;
}

const HOME = os.homedir();

export const BUILD_REPOS: BuildRepo[] = [
  {
    key: "stride-console",
    name: "Stride Console",
    dir: path.join(HOME, "stride-console"),
    note: "This app: sales, marketing, delivery.",
  },
  {
    key: "ai-discovery-durabo",
    name: "Durabo discovery",
    dir: path.join(HOME, "ai-discovery-durabo"),
    note: "Interview dossiers, transcripts, synthesis.",
  },
  {
    key: "stride-durabo",
    name: "Durabo-OS",
    dir: path.join(HOME, "stride-durabo"),
    note: "The Durabo frontend + reader layer.",
  },
  {
    key: "durabo-trend-engine",
    name: "Trend engine",
    dir: path.join(HOME, "durabo-trend-engine"),
    note: "Toy trend prediction: TikTok, CLIP, forecasts.",
  },
  {
    key: "stride-pitch",
    name: "Pitch deck",
    dir: path.join(HOME, "stride-pitch"),
    note: "The 11-slide CSS-3D deck.",
  },
  {
    key: "ai-agency-website",
    name: "stride-ai.nl",
    dir: path.join(HOME, "ai-agency-website"),
    note: "The public site the SEO engine writes to.",
  },
];

/** The tmux session name the relay forces for a repo. */
export function sessionNameFor(dir: string): string {
  return `b-${path.basename(dir)}`;
}
