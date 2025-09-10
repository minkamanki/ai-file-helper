import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Account {
    expires_in?: number;
  }
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}
