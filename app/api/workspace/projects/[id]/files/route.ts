import { NextResponse } from "next/server";
import { getProject, putProject } from "@/lib/workspace/store";
import {
  MAX_UPLOAD_BYTES,
  listDir,
  projectDir,
  readTextFile,
  removePath,
  saveFile,
} from "@/lib/workspace/files";
import { commitAll } from "@/lib/workspace/git";

export const dynamic = "force-dynamic";

/**
 * Files in and out of a project directory.
 *
 * Uploads are one raw-body POST per file, the speech/hear pattern: multipart
 * would buffer a whole folder drop in memory at once, and one request per
 * file gives per-file progress for free.
 *
 * This route is not in the public allowlist in proxy.ts, and must not be: it
 * writes to this machine's disk.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const url = new URL(request.url);
  const rel = url.searchParams.get("path") ?? "";
  try {
    if (url.searchParams.get("preview")) {
      return new NextResponse(readTextFile(project, rel), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ entries: listDir(project, rel) });
  } catch {
    return NextResponse.json({ error: "That path could not be read." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const url = new URL(request.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) {
    return NextResponse.json({ error: "The file needs a path." }, { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Nothing was uploaded." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "That file is too big for the console. Put it in the project folder directly." },
      { status: 413 },
    );
  }

  try {
    saveFile(project, rel, bytes);
  } catch {
    return NextResponse.json({ error: "That path is not allowed." }, { status: 400 });
  }

  // The client sends commit=1 on the last file of a drop, so a sixty-file
  // folder lands as one commit, not sixty.
  if (url.searchParams.get("commit")) {
    commitAll(projectDir(project), "Files added from the console");
    putProject({ ...project, updatedAt: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const rel = new URL(request.url).searchParams.get("path") ?? "";
  if (!rel) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });

  try {
    removePath(project, rel);
  } catch {
    return NextResponse.json({ error: "That path is not allowed." }, { status: 400 });
  }
  commitAll(projectDir(project), `Removed ${rel} from the console`);
  putProject({ ...project, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
