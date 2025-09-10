'use client'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types/chat'


export default function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const listRef = useRef<HTMLDivElement>(null)


    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])


    async function send() {
        if (!input.trim()) return
        const newMsgs = [...messages, { role: 'user', content: input } as ChatMessage]
        setMessages(newMsgs)
        setInput('')
        setLoading(true)
        try {
            const driveId = (document.getElementById('__drive_file_id') as HTMLInputElement)?.value
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMsgs,
                    driveRef: driveId ? { id: driveId } : undefined
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Request failed')
            setMessages([...newMsgs, { role: 'assistant', content: data.answer }])
        } catch (e: any) {
            setMessages([...newMsgs, { role: 'assistant', content: `Error: ${e.message}` }])
        } finally {
            setLoading(false)
        }
    }


    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void send()
        }
    }


    return (
        <div className="chat">
            <div ref={listRef} className="messages">
                {messages.map((m, i) => (
                    <div key={i} className="message">
                        <div className="role">{m.role}</div>
                        <div>{m.content}</div>
                    </div>
                ))}
                {loading && <div className="small">Thinking…</div>}
            </div>
            <div className="row">
                <textarea rows={3} placeholder="Ask something… (Ctrl/Cmd+Enter to send)" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} />
                <button className="primary" onClick={send} disabled={loading}>Send</button>
            </div>
        </div>
    )
}