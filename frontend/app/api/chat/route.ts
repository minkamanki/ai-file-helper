import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { loadDriveFileContent } from "@/lib/drive-helpers";
import { buildOrLoadIndex, retrieve } from "@/lib/rag";

export const runtime = "nodejs";

/** Choose how to render citations that come back like [CHUNK 1, CHUNK 6] */
type CitationMode = "none" | "page" | "title" | "page-or-title";
const CITATION_MODE: CitationMode = "page-or-title";

/* ----------------------------- Request schema ----------------------------- */
const BodySchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })
  ),
  driveRef: z
    .object({ id: z.string().optional(), link: z.string().optional() })
    .optional(),
});

/* --------------------------------- Helpers -------------------------------- */
function deriveFileId(driveRef?: { id?: string; link?: string }): string | undefined {
  if (!driveRef) return;
  if (driveRef.id) return driveRef.id;
  if (driveRef.link) {
    // handle common link shapes
    const m = driveRef.link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    try {
      const u = new URL(driveRef.link);
      const id = u.searchParams.get("id");
      if (id) return id;
    } catch {
      /* ignore bad URLs */
    }
  }
}

/** Find form-feed page breaks (\f) in the raw text (typical for PDF extract). */
function computePageStarts(docText: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < docText.length; i++) {
    if (docText.charCodeAt(i) === 12 /* \f */) starts.push(i + 1);
  }
  return starts;
}

function pageForOffset(offset: number, pageStarts: number[]): number | undefined {
  if (!pageStarts.length || pageStarts.length === 1) return undefined;
  let page = 1;
  for (let i = 0; i < pageStarts.length; i++) {
    if (offset >= pageStarts[i]) page = i + 1;
    else break;
  }
  return page;
}

/** Heuristic: nearest heading line above a position */
function nearestHeadingAbove(docText: string, start: number): string | undefined {
  const windowBack = Math.max(0, start - 6000);
  const slice = docText.slice(windowBack, start);
  const lines = slice.split(/\r?\n/).reverse();

  // Markdown headings, numbered headings, or Title-like lines (short, ends optional colon)
  const headingRe =
    /^\s*(?:#{1,6}\s+.+|(?:\d+\.)+\s+.+|[A-Z][A-Za-z0-9 .,&/()-]{3,}\:?)\s*$/;

  for (const ln of lines) {
    const line = ln.trim();
    if (!line) continue;
    if (headingRe.test(line) && line.length <= 120) {
      return line.replace(/\s*:$/, "");
    }
  }
  return undefined;
}

/** Replace [CHUNK 1, CHUNK 6] with (p. X; “Title”) or strip entirely */
function prettyReplaceChunkCitations(
  text: string,
  meta: Record<number, { page?: number; title?: string }>,
  mode: CitationMode
): string {
  if (mode === "none") {
    return text.replace(/\[CHUNK[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return text.replace(/\[CHUNK\s+([\d,\s]+)\]/g, (_m, nums: string) => {
    const list = nums
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const labels: string[] = [];
    for (const n of list) {
      const m = meta[n];
      if (!m) continue;
      if (mode === "page" && m.page) labels.push(`p. ${m.page}`);
      else if (mode === "title" && m.title) labels.push(`“${m.title}”`);
      else if (mode === "page-or-title") {
        if (m.page) labels.push(`p. ${m.page}`);
        else if (m.title) labels.push(`“${m.title}”`);
      }
    }
    return labels.length ? ` (${labels.join("; ")})` : "";
  });
}

/* ---------------------------------- Route --------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { messages, driveRef } = BodySchema.parse(json);

    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken as string | undefined;

    let contextBlocks = "";
    let citationMeta: Record<number, { page?: number; title?: string }> | undefined;
    let tops:
      | Array<{ id: string; start: number; end: number; text: string }>
      | undefined;

    const fileId = deriveFileId(driveRef);

    if (fileId && accessToken) {
      const loaded = await loadDriveFileContent(fileId, accessToken);

      if (loaded.text) {
        // Build or load vector index
        const index = await buildOrLoadIndex(
          loaded.id,
          loaded.modifiedTime,
          loaded.text
        );

        // Retrieve top chunks for the latest user question
        const lastUser =
          [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        tops = await retrieve(index, lastUser, 8);

        // Build friendly citation metadata (page numbers & headings)
        const pageStarts = computePageStarts(loaded.text);
        citationMeta = {};
        tops.forEach((c, i) => {
          const chunkNo = i + 1; // [CHUNK 1], [CHUNK 2], ...
          citationMeta![chunkNo] = {
            page: pageForOffset(c.start, pageStarts),
            title: nearestHeadingAbove(loaded.text!, c.start),
          };
        });

        // Context block for the model (we still ask it to cite with [CHUNK N])
        const ctx = tops
          .map((c, i) => {
            const n = i + 1;
            const meta = citationMeta![n];
            const extra =
              (meta?.page ? ` page=${meta.page}` : "") +
              (meta?.title ? ` title="${meta.title}"` : "");
            return [`[CHUNK ${n} id=${c.id} start=${c.start} end=${c.end}${extra}]`, c.text].join(
              "\n"
            );
          })
          .join("\n\n---\n\n");

        contextBlocks =
          `You have access to an indexed Google Drive file (freshest version).\n` +
          `File: ${loaded.name} (mime=${loaded.mimeType}, modified=${loaded.modifiedTime})\n` +
          `The following are the most relevant excerpts. Cite them by [CHUNK N] in your answer.\n` +
          `BEGIN_EXCERPTS\n${ctx}\nEND_EXCERPTS\n`;
      } else {
        // Non-text file (image, binary, etc.)
        contextBlocks = `A Drive file is attached (id=${loaded.id}, name=${loaded.name}, mime=${loaded.mimeType}, modified=${loaded.modifiedTime}), but it is not text-readable here.`;
      }
    } else if (fileId && !accessToken) {
      contextBlocks = `A Drive file ID was provided but no Google session token is available. Ask the user to sign in with Google.`;
    }

    // System guidance
    const system = {
      role: "system" as const,
      content:
        `You are a helpful assistant. If excerpts are provided, rely on them and cite using [CHUNK N]. ` +
        `Do not invent citations. If a needed detail likely exists outside the excerpts, say so and ask for permission to fetch more.`,
    };

    // Compose final prompt
    const finalMessages = [
      system,
      ...(contextBlocks ? [{ role: "user" as const, content: contextBlocks }] : []),
      ...messages,
    ];

    // Call the model
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: finalMessages,
      temperature: 0.2,
    });

    // Post-process the answer to replace/strip [CHUNK N] citations
    let answer = completion.choices[0]?.message?.content ?? "";
    if (citationMeta && Object.keys(citationMeta).length) {
      answer = prettyReplaceChunkCitations(answer, citationMeta, CITATION_MODE);
    }

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("API error:", err);
    return new Response(
      JSON.stringify({
        error: err.message ?? "Unknown error",
        details: err?.issues ?? err?.stack,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
