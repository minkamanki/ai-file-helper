export function extractDriveId(input: string): string | undefined {
if (!input) return
// Try raw ID
if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input
// URL patterns
try {
const m = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
if (m) return m[1]
const u = new URL(input)
return u.searchParams.get('id') ?? undefined
} catch {
return undefined
}
}