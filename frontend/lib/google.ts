export async function driveGet<T>(
    path: string,
    accessToken: string,
    init?: RequestInit
): Promise<T> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
        ...init,
        headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${accessToken}`
        },
        cache: 'no-store'
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Drive API error ${res.status}: ${text}`)
    }
    return (await res.json()) as T
}


export async function driveGetBinary(
    path: string,
    accessToken: string
): Promise<ArrayBuffer> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Drive API error ${res.status}: ${text}`)
    }
    return await res.arrayBuffer()
}