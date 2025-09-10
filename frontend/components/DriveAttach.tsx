'use client'
import { useEffect, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'

declare global {
    interface Window {
        gapi: any
        google: any
    }
}

export default function DriveAttach() {
    const { data: session, status } = useSession()
    const [pickerReady, setPickerReady] = useState(false)
    const [fileName, setFileName] = useState<string | null>(null)
    // Load Google Picker only when authenticated
    useEffect(() => {
        let mounted = true
        if (status !== 'authenticated') {
            setPickerReady(false)
            return
        }

        const loadPicker = async () => {
            if (typeof window === 'undefined') return
            if (window.google?.picker) { setPickerReady(true); return }

            await new Promise<void>((resolve, reject) => {
                const s = document.createElement('script')
                s.src = 'https://apis.google.com/js/api.js'
                s.async = true
                s.onload = () => resolve()
                s.onerror = () => reject(new Error('Failed to load Google API script'))
                document.body.appendChild(s)
            })

            await new Promise<void>((resolve) => {
                window.gapi.load('picker', { callback: () => resolve() })
            })

            if (mounted) setPickerReady(true)
        }

        loadPicker().catch(() => setPickerReady(false))
        return () => { mounted = false }
    }, [status])

    const openPicker = () => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY as string | undefined
        const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID as string | undefined // project number
        const token = (session as any)?.accessToken as string | undefined

        if (!apiKey || !appId) {
            alert('Google Picker not configured. Set NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_PICKER_APP_ID.')
            return
        }
        if (!token) {
            alert('Sign in with Google first.')
            return
        }
        if (!pickerReady) return

        const view = new window.google.picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false)

        const picker = new window.google.picker.PickerBuilder()
            .setAppId(appId)             // Google Cloud project number
            .setDeveloperKey(apiKey)     // Browser API key
            .setOAuthToken(token)        // User access token with Drive scope
            .addView(view)
            .setMaxItems(1)
            .setCallback((data: any) => {
                if (data.action === 'picked') {
                    const doc = data?.docs?.[0]
                    const id = doc?.id as string | undefined
                    if (id) {
                        const hidden = document.getElementById('__drive_file_id') as HTMLInputElement | null
                        if (hidden) hidden.value = id

                        // show name immediately if Picker returned it
                        if (doc?.name) setFileName(doc.name)

                        // fallback: fetch name from Drive if Picker didn't include it
                        if (!doc?.name) {
                            fetch(
                                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name`,
                                { headers: { Authorization: `Bearer ${token}` } }
                            )
                                .then(r => r.ok ? r.json() : null)
                                .then(meta => setFileName(meta?.name ?? null))
                                .catch(() => { })
                        }
                    }
                }
            })
            .build()

        picker.setVisible(true)
    }

    return (
        <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                    {status === 'authenticated' ? (
                        <>
                            <span className="badge">Google signed in</span>
                            <span className="small" style={{ marginLeft: 8 }}>{session?.user?.email}</span>
                        </>
                    ) : (
                        <span className="badge">Not signed in</span>
                    )}
                </div>
                <div>
                    {status === 'authenticated' ? (
                        <button onClick={() => signOut()}>Sign out</button>
                    ) : (
                        <button className="primary" onClick={() => signIn('google')}>Sign in with Google</button>
                    )}
                </div>
            </div>

            {status === 'authenticated' && (
                <div style={{ marginTop: 12 }}>
                    <button
                        className="primary"
                        onClick={openPicker}
                        disabled={!pickerReady}
                        title={pickerReady ? 'Pick from Drive' : 'Loading Google Picker…'}
                    >
                        Pick from Drive
                    </button>
                </div>
            )}
            {fileName && (
                <p className="small" style={{ marginTop: 8 }}>
                    Attached file: <strong>{fileName}</strong>
                </p>
            )}
            {/* Hidden field used by your chat code */}
            <input type="hidden" id="__drive_file_id" value="" readOnly />
        </div>
    )
}
