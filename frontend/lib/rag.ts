// lib/rag.ts
import { openai } from "@/lib/openai"

type Chunk = { id: string; text: string; start: number; end: number }
export type RagIndex = {
    fileId: string
    modifiedTime: string
    chunks: (Chunk & { embedding: number[] })[]
}

const inMemory: Record<string, RagIndex> = {}

function safeChunkText(
    text: string,
    targetChars = 1800,
    overlapChars = 200,
    maxChunks = 10_000
): Chunk[] {
    const chunks: Chunk[] = []
    if (!text || targetChars <= 0) return chunks

    // Ensure progress even if someone passes silly params
    const target = Math.max(1, targetChars)
    const overlap = Math.max(0, Math.min(overlapChars, target - 1))
    const step = Math.max(1, target - overlap)

    const len = text.length
    let start = 0
    let n = 0

    while (start < len && n < maxChunks) {
        const end = Math.min(len, start + target)
        chunks.push({ id: `c${n}`, text: text.slice(start, end), start, end })
        if (end >= len) break
        start += step
        n++
    }

    return chunks
}

async function embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = []
    const BATCH = 64 // tune to your infra
    for (let i = 0; i < texts.length; i += BATCH) {
        const slice = texts.slice(i, i + BATCH)
        const resp = await openai.embeddings.create({
            model: "text-embedding-3-large",
            input: slice
        })
        for (const d of resp.data) out.push(d.embedding)
    }
    return out
}

export async function buildOrLoadIndex(
    fileId: string,
    modifiedTime: string,
    text: string
): Promise<RagIndex> {
    const key = `${fileId}:${modifiedTime}`
    if (inMemory[key]) return inMemory[key]

    const rawChunks = safeChunkText(text, 1800, 200)
    if (rawChunks.length === 0) {
        return { fileId, modifiedTime, chunks: [] }
    }

    const vectors = await embedBatch(rawChunks.map(c => c.text))
    const chunks = rawChunks.map((c, i) => ({ ...c, embedding: vectors[i] }))
    const index: RagIndex = { fileId, modifiedTime, chunks }
    inMemory[key] = index
    return index
}

function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0
    const L = a.length
    for (let i = 0; i < L; i++) {
        const av = a[i], bv = b[i]
        dot += av * bv
        na += av * av
        nb += bv * bv
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) || 1
    return dot / denom
}

export async function retrieve(index: RagIndex, query: string, k = 8) {
    if (!index.chunks?.length || !query) return []
    const [qv] = await embedBatch([query])
    const scored = index.chunks.map(ch => ({ ...ch, score: cosine(ch.embedding, qv) }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, Math.max(1, k))
}
