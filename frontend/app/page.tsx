import Chat from '@/components/Chat'
import DriveAttach from '@/components/DriveAttach'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'


export default async function Page() {
  const session = await getServerSession(authOptions)


  return (
    <div className="card">
      <DriveAttach />
      <hr />
      <Chat />
    </div>
  )
}