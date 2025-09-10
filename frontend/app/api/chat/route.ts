import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { openai, OPENAI_MODEL } from '@/lib/openai'
import { loadDriveFileContent } from '@/lib/drive-helpers'

export const runtime = 'nodejs'


const BodySchema = z.object({
    messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() })),
    driveRef: z.object({ id: z.string().optional(), link: z.string().optional() }).optional()
})


function deriveFileId(driveRef?: { id?: string; link?: string }): string | undefined {
    if (!driveRef) return
    if (driveRef.id) return driveRef.id
    if (driveRef.link) {
        // handle common link shapes
        const m = driveRef.link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
        if (m) return m[1]
        const u = new URL(driveRef.link)
        const id = u.searchParams.get('id')
        if (id) return id
    }
}


export async function POST(req: NextRequest) {
    try {
        const json = await req.json()
        const { messages, driveRef } = BodySchema.parse(json)


        const session = await getServerSession(authOptions)
        const accessToken = (session as any)?.accessToken as string | undefined


        let freshFileSnippet = ''
        const fileId = deriveFileId(driveRef)


        if (fileId && accessToken) {
            const loaded = await loadDriveFileContent(fileId, accessToken)
            if (loaded.text) {
                // Keep prompt small if file huge
                const MAX_CHARS = 50_000
                const text = loaded.text.length > MAX_CHARS ?
                    loaded.text.slice(0, MAX_CHARS) + `\n\n[Truncated to ${MAX_CHARS} chars]` :
                    loaded.text


                freshFileSnippet = `You have access to the latest version of a user-attached file from Google Drive.\n` +
                    `File: ${loaded.name} (mime=${loaded.mimeType}, modified=${loaded.modifiedTime})\n` +
                    `BEGIN_FILE_CONTENT\n${text}\nEND_FILE_CONTENT\n`
            } else {
                freshFileSnippet = `A Drive file is attached (id=${loaded.id}, name=${loaded.name}, mime=${loaded.mimeType}, modified=${loaded.modifiedTime}), but it is not text-readable here. Explain limitations and suggest how to proceed.`
            }
        } else if (fileId && !accessToken) {
            freshFileSnippet = `A Drive file ID was provided but no Google session token is available. Ask the user to sign in with Google.`
        }


        const system = {
            role: 'system' as const,
            content:
                `You are a helpful assistant. If a Drive file is described below, it is the FRESHEST version. Prefer it over memory. ` +
                `When answering, cite specific sections from the provided file content when relevant. If the file isn't readable, explain options.`
        }


        const finalMessages = [system, ...(freshFileSnippet ? [{ role: 'user' as const, content: freshFileSnippet }] : []), ...messages]


        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: finalMessages,
            temperature: 0.2
        })


        const answer = completion.choices[0]?.message?.content ?? ''


        return new Response(JSON.stringify({ answer }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 400 })
    }
}