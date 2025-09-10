import { driveGet, driveGetBinary } from '@/lib/google'


export type LoadedDriveFile = {
id: string
name: string
mimeType: string
modifiedTime: string
version?: string
size?: number
text?: string
}


const TEXT_LIKE = [
/^text\//,
/^application\/json$/,
/^text\/csv$/
]


const isTextLike = (mime: string) => TEXT_LIKE.some((r) => r.test(mime))


export async function loadDriveFileContent(
fileId: string,
accessToken: string
): Promise<LoadedDriveFile> {
// Always fetch fresh metadata first
const meta = await driveGet<{
id: string
name: string
mimeType: string
modifiedTime: string
version?: string
size?: string
}>(`files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,version,size`, accessToken)


const out: LoadedDriveFile = {
id: meta.id,
name: meta.name,
mimeType: meta.mimeType,
modifiedTime: meta.modifiedTime,
version: meta.version,
size: meta.size ? Number(meta.size) : undefined
}


// Handle Google Docs export => text/plain
if (meta.mimeType === 'application/vnd.google-apps.document') {
const buf = await driveGetBinary(
`files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
accessToken
)
out.text = new TextDecoder().decode(new Uint8Array(buf))
return out
}


if (isTextLike(meta.mimeType)) {
const buf = await driveGetBinary(
`files/${encodeURIComponent(fileId)}?alt=media`,
accessToken
)
out.text = new TextDecoder().decode(new Uint8Array(buf))
return out
}


// Non-text fallthrough
return out
}