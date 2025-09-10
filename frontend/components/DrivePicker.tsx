'use client'
import { useEffect, useState } from 'react'


declare global { interface Window { gapi: any; google: any } }


export default function DrivePicker() {
    const [ready, setReady] = useState(false)


    useEffect(() => {
        const load = async () => {
            await new Promise<void>((resolve) => {
                const s = document.createElement('script')
                s.src = 'https://apis.google.com/js/api.js'
                s.onload = () => resolve()
                document.body.appendChild(s)
            })
            await new Promise<void>((resolve) => {
                const s = document.createElement('script')
                s.src = 'https://accounts.google.com/gsi/client'
                s.onload = () => resolve()
                document.body.appendChild(s)
            })
            setReady(true)
        }
        void load()
    }, [])


    async function openPicker() {
        if (!ready) return
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY!
        const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID!


        // Minimal Picker using token-less view for shared files. For private files, rely on being signed in via NextAuth.
        // In production, you’d mint an OAuth token client-side too.


        // @ts-ignore
        await new Promise((r) => window.gapi.load('picker', { callback: r }))


        // @ts-ignore
        const view = new window.google.picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false)


        // @ts-ignore
        const picker = new window.google.picker.PickerBuilder()
            .setAppId(appId)
            .setDeveloperKey(apiKey)
            .addView(view)
            .setCallback((data: any) => {
                if (data.action === 'picked') {
                    const file = data.docs[0]
                    const id = file.id
                    const hidden = document.getElementById('__drive_file_id') as HTMLInputElement
                    if (hidden) hidden.value = id
                }
            })
            .build()


        picker.setVisible(true)
    }


    return (
        <div style={{ marginTop: 12 }}>
            <button onClick={openPicker}>Open Google Drive Picker</button>
        </div>
    )
}