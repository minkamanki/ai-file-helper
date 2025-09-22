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
  const { data: session, status } = useSession() // ← no generic here
  const [pickerReady, setPickerReady] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [driveId, setDriveId] = useState<string>('')

  // These now exist thanks to module augmentation
const hasDriveConsent = Boolean((session as any)?.hasDriveConsent);
const accessToken = (session as any)?.accessToken as string | undefined;

  useEffect(() => {
    let mounted = true
    if (status !== 'authenticated' || !accessToken) {
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
  }, [status, accessToken])

  const openPicker = () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY as string | undefined
    const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID as string | undefined
    const token = accessToken

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
      .setAppId(appId)
      .setDeveloperKey(apiKey)
      .setOAuthToken(token)
      .addView(view)
      .setMaxItems(1)
      .setCallback((data: any) => {
        if (data.action === 'picked') {
          const doc = data?.docs?.[0]
          const id = doc?.id as string | undefined
          if (id) {
            setDriveId(id)

            if (doc?.name) setFileName(doc.name)
            else {
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
          {status === 'authenticated' && accessToken ? (
            <>
              <span className="badge">Google signed in</span>
              <span className="small" style={{ marginLeft: 8 }}>{session?.user?.email}</span>
            </>
          ) : (
            <span className="badge">Not signed in</span>
          )}
        </div>
        <div>
          {status === 'authenticated' && accessToken ? (
            <button onClick={() => signOut()}>Sign out</button>
          ) : (
            <button
              className="primary"
              onClick={() =>
                signIn('google', {
                  access_type: 'offline',
                  // Ask for consent only if we don't yet have a refresh token server-side
                  ...(hasDriveConsent ? {} : { prompt: 'consent' }),
                })
              }
            >
              Sign in with Google
            </button>
          )}
        </div>
      </div>

      {status === 'authenticated' && accessToken && (
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
      <input type="hidden" id="__drive_file_id" value={driveId} readOnly />
    </div>
  )
}
