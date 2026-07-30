import { NextResponse } from "next/server";
import { getArticle, listArticles, saveArticle } from "@/lib/seo/store";
import { publishArticle } from "@/lib/seo/publish";
import { lintArticle } from "@/lib/seo/lint";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(article);
}

/** Edit a draft in place. Re-lints, so a human edit cannot slip past the gate. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (article.status === "published") {
    return NextResponse.json({ error: "Already published." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    body?: string;
  };

  if (typeof body.title === "string" && body.title.trim()) article.title = body.title.trim();
  if (typeof body.description === "string" && body.description.trim()) {
    article.description = body.description.trim();
  }
  if (typeof body.body === "string" && body.body.trim()) article.body = body.body.trim();

  const result = lintArticle(article.body);
  article.lint = {
    errors: result.errors,
    warns: result.warns,
    violations: result.violations,
  };
  article.wordCount = article.body.split(/\s+/).filter(Boolean).length;
  saveArticle(article);

  return NextResponse.json(article);
}

/**
 * The publish button.
 *
 * action "publish" writes the markdown into the website checkout, commits and
 * pushes, so the site rebuilds. action "reject" drops the draft out of the
 * queue without touching the site.
 *
 * Publishing is refused while the voice gate still reports errors. The whole
 * point of the gate is that nothing reaches the site sounding like a machine,
 * and a button that quietly overrides it would make the gate decorative.
 * Editing the draft until it passes is the way through.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === "reject") {
    article.status = "rejected";
    saveArticle(article);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (body.action !== "publish") {
    return NextResponse.json({ error: 'action must be "publish" or "reject".' }, { status: 400 });
  }

  if (article.status === "published") {
    return NextResponse.json({ error: "Already published." }, { status: 409 });
  }

  const result = publishArticle(article);

  if (!result.ok) {
    // The gate refusing is the author's problem to fix; anything else is the
    // repository's, and those deserve different status codes.
    if (result.blockedBy) {
      return NextResponse.json(
        { error: result.message, violations: result.blockedBy },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "published",
    commit: result.commit,
    pushed: result.pushed,
    message: result.message,
    remaining: listArticles().filter((a) => a.status === "drafted").length,
  });
}
