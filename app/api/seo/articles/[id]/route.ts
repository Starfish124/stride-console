import { NextResponse } from "next/server";
import { getArticle, getConfig, listArticles, saveArticle } from "@/lib/seo/store";
import { publish } from "@/lib/seo/publish";
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
 * pushes, so Netlify rebuilds. action "reject" drops the draft out of the
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

  if (article.lint.errors > 0) {
    return NextResponse.json(
      {
        error: `The voice gate still reports ${article.lint.errors} error${article.lint.errors === 1 ? "" : "s"}. Edit the draft first.`,
        violations: article.lint.violations.filter((v) => v.severity === "error"),
      },
      { status: 422 },
    );
  }

  const config = getConfig();
  const now = new Date();
  article.publishedAt = now.toISOString();

  const result = publish([article], {
    repo: config.siteRepo,
    push: config.autoPublishOnApproval,
    now,
  });

  if (!result.ok) {
    // Leave the draft approved but unpublished, so a retry after fixing the
    // repository does not need the article rewritten.
    article.status = "approved";
    article.publishedAt = undefined;
    saveArticle(article);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  article.status = "published";
  article.commit = result.commit;
  saveArticle(article);

  return NextResponse.json({
    ok: true,
    status: "published",
    commit: result.commit,
    pushed: result.pushed,
    message: result.pushed
      ? `Published as ${result.commit}. Netlify is rebuilding.`
      : `Committed as ${result.commit}. Push it when ready.`,
    remaining: listArticles().filter((a) => a.status === "drafted").length,
  });
}
