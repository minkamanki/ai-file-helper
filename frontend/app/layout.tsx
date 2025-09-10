import './globals.css'
import { ReactNode } from 'react'
import { Providers } from './providers'


export const metadata = {
  title: 'Drive Chat — Always Fresh',
  description: 'OpenAI chat that always fetches the latest Google Drive file before answering.'
}


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="container">
            <h1>Drive Chat <span className="badge">always fetches latest</span></h1>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}