import { NextResponse } from "next/server";
import { getClient, newId } from "@/lib/store";
import {
  deleteConnector,
  getConnector,
  hasSecret,
  listConnectors,
  putConnector,
  saveSecret,
} from "@/lib/workspace/store";
import type { Connector } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

/**
 * Ways into a client's own systems. The secret arrives once in the POST
 * body, goes straight into a 0600 file, and never comes back out of any
 * response — GET returns whether one exists, not what it is.
 */

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
  const withSecret = listConnectors(clientId).map((c) => ({
    ...c,
    hasSecret: hasSecret(c.id),
  }));
  return NextResponse.json(withSecret);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const kind = body.kind === "ssh" ? "ssh" : body.kind === "git" ? "git" : undefined;
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";

  if (!getClient(clientId)) {
    return NextResponse.json({ error: "No such client." }, { status: 404 });
  }
  if (!kind) return NextResponse.json({ error: "Git or SSH." }, { status: 400 });
  if (!label) {
    return NextResponse.json({ error: "The connector needs a name." }, { status: 400 });
  }
  if (!secret) {
    return NextResponse.json(
      { error: "The connector needs its key or token." },
      { status: 400 },
    );
  }

  const connector: Connector = {
    id: newId("conn"),
    clientId,
    kind,
    label,
    createdAt: new Date().toISOString(),
  };

  if (kind === "git") {
    const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
    const auth = body.auth === "sshKey" ? "sshKey" : "pat";
    // https or ssh remotes only — a file:// remote would point git at this
    // machine's own disk.
    if (!/^(https:\/\/|git@|ssh:\/\/)/.test(repoUrl)) {
      return NextResponse.json(
        { error: "The repo URL should start with https://, git@ or ssh://." },
        { status: 400 },
      );
    }
    connector.repoUrl = repoUrl;
    connector.auth = auth;
    if (auth === "pat") {
      // git-credential-store format, built here so the PAT itself is the only
      // thing the founder pastes.
      let host: string;
      try {
        host = new URL(repoUrl).host;
      } catch {
        return NextResponse.json(
          { error: "A token needs an https:// repo URL." },
          { status: 400 },
        );
      }
      saveSecret(connector.id, `https://x-access-token:${secret}@${host}\n`);
    } else {
      // A private key must end in a newline or ssh refuses it.
      saveSecret(connector.id, secret.endsWith("\n") ? secret : `${secret}\n`);
    }
  } else {
    const host = typeof body.host === "string" ? body.host.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!host || !username) {
      return NextResponse.json(
        { error: "SSH needs a host and a username." },
        { status: 400 },
      );
    }
    connector.host = host;
    connector.username = username;
    saveSecret(connector.id, secret.endsWith("\n") ? secret : `${secret}\n`);
  }

  putConnector(connector);
  return NextResponse.json({ ...connector, hasSecret: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!getConnector(id)) {
    return NextResponse.json({ error: "No such connector." }, { status: 404 });
  }
  // deleteConnector removes the secret file with the record.
  deleteConnector(id);
  return NextResponse.json({ ok: true });
}
