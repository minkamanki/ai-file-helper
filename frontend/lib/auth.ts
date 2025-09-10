import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'


export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    // Request offline for refresh_token; include Drive scopes
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: [
                        'openid',
                        'email',
                        'profile',
                        'https://www.googleapis.com/auth/drive.readonly',
                        'https://www.googleapis.com/auth/drive.file'
                    ].join(' ')
                }
            }
        })
    ],
    callbacks: {
        async jwt({ token, account }) {
            if (account) {
                token.accessToken = account.access_token ?? token.accessToken;
                token.refreshToken = account.refresh_token ?? token.refreshToken;

                if (typeof account.expires_at === 'number') {
                    token.expiresAt = account.expires_at * 1000;
                } else {
                    const expiresInSec: number =
                        typeof (account as any).expires_in === 'number'
                            ? (account as any).expires_in
                            : 3600; // default 1h

                    token.expiresAt = Date.now() + expiresInSec * 1000;
                }
            }
            return token;
        },
        async session({ session, token }) {
            (session as any).accessToken = (token as any).accessToken;
            (session as any).refreshToken = (token as any).refreshToken;
            (session as any).expiresAt = (token as any).expiresAt;
            return session;
        },
    },
    session: { strategy: 'jwt' },
    secret: process.env.NEXTAUTH_SECRET
}