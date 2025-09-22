// auth.ts
import type { NextAuthOptions, Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: String(token.refreshToken),
      }),
    });

    const data = await res.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!res.ok || !data.access_token) throw new Error("no access_token");

    token.accessToken = data.access_token;
    token.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    // Google usually doesn’t return refresh_token on refresh; keep old one
    if (data.refresh_token) token.refreshToken = data.refresh_token;
    return token;
  } catch {
    // Invalidate tokens so the app treats the user as signed out
    delete token.accessToken;
    delete token.expiresAt;
    // keep refreshToken as-is; it may be revoked though
    return token;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          access_type: "offline",
          // IMPORTANT: do NOT force prompt=consent here
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.file",
          ].join(" "),
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({
      token,
      account,
    }: {
      token: JWT;
      account: (Account & {
        access_token?: string;
        refresh_token?: string;
        expires_at?: number; // seconds
        expires_in?: number; // seconds
      }) | null;
    }): Promise<JWT> {
      // Initial sign-in
      if (account) {
        if (account.access_token) token.accessToken = account.access_token;
        if (account.refresh_token) token.refreshToken = account.refresh_token;

        if (typeof account.expires_at === "number") {
          token.expiresAt = account.expires_at * 1000;
        } else {
          const sec = typeof account.expires_in === "number" ? account.expires_in : 3600;
          token.expiresAt = Date.now() + sec * 1000;
        }
        return token;
      }

      // No access token in token => treat as signed out
      if (!token.accessToken || !token.expiresAt) return token;

      // Refresh if expiring within 60s
      if (Date.now() >= token.expiresAt - 60_000) {
        if (token.refreshToken) {
          return await refreshGoogleAccessToken(token);
        }
        // No refresh token → invalidate access token
        delete token.accessToken;
        delete token.expiresAt;
      }

      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      // Expose only what the client needs
      (session as any).accessToken = token.accessToken;
      (session as any).expiresAt = token.expiresAt;
      (session as any).hasDriveConsent = Boolean(token.refreshToken);
      // DO NOT expose refreshToken to the browser
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
