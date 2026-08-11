import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { chat } from "@/lib/ask/ollama";
import { readTranscript } from "@/lib/durabo/audio";
import { duraboRoot, readFieldCard, readLive, readNotes, requireSlug } from "@/lib/durabo/io";

// "Wat missen we?" — on demand only. This Mac also runs whisper during the
// interview, so nothing here polls or loops; one tap, one local model call.
// The model decides ATTENTION (what to ask next), never fact.

function sharpQuestion(slug: string): string {
  try {
    const md = fs.readFileSync(path.join(duraboRoot(), "employees", slug, `${slug}.md`), "utf8");
    const block = md.match(/<!-- MAP-DATA:START -->[\s\S]*?```json\n([\s\S]*?)```/);
    if (!block) return "";
    return (JSON.parse(block[1]) as { sharp?: string }).sharp ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : "";
  try {
    requireSlug(slug);
  } catch {
    return NextResponse.json({ error: "Not on the roster." }, { status: 404 });
  }

  const transcript = readTranscript(slug);
  const checked = readLive().interviews[slug]?.checked ?? {};
  const open = readFieldCard()
    .filter((s) => !checked[String(s.num)])
    .map((s) => `${s.num}. ${s.title}${s.flag ? ` (${s.flag})` : ""}`)
    .join("\n");
  const sharp = sharpQuestion(slug);
  const notes = readNotes(slug);

  const prompt = [
    "Je bent de stille meelezer bij een discovery-interview bij Durabo (speelgoedimporteur).",
    "Hieronder: het live transcript tot nu toe, de nog niet afgevinkte punten van de veldkaart, en aantekeningen.",
    "Noem de 2 of 3 concreetste dingen die NU nog gevraagd moeten worden, in het Nederlands.",
    "Alleen vragen die uit dit materiaal volgen — verzin geen feiten. Kort: één zin per punt, direct te stellen formulering.",
    sharp ? `\nSCHERPE VRAAG VOOR DEZE PERSOON (uit de voorbereiding):\n${sharp}` : "",
    `\nNOG OPEN OP DE KAART:\n${open || "alles afgevinkt"}`,
    notes ? `\nAANTEKENINGEN:\n${notes.slice(-1500)}` : "",
    `\nTRANSCRIPT (laatste deel):\n${transcript.slice(-6000) || "nog geen transcript"}`,
  ].join("\n");

  try {
    const answer = await chat([{ role: "user", content: prompt }], { temperature: 0.3 });
    return NextResponse.json({ suggestions: answer.trim() });
  } catch {
    return NextResponse.json(
      { error: "Het lokale model antwoordt niet — Ollama draait niet of is koud." },
      { status: 502 },
    );
  }
}
