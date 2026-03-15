import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    accessToken: string;
    webApiUrl: string;
    ctx: string;              // tenant context id from SuperOffice
    companyName: string;      // tenant company name
    systemUserToken?: string; // system_token claim — present when "Server to server" is enabled
    error?: "RefreshTokenError" | "RefreshTokenMissing";
  }
}

// ---------------------------------------------------------------------------
// Token refresh helper
// ---------------------------------------------------------------------------

const ISSUER = process.env.SUPEROFFICE_ISSUER ?? "https://sod.superoffice.com";
const TOKEN_URL = `${ISSUER}/login/common/oauth/tokens`;

interface RefreshedTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.SUPEROFFICE_CLIENT_ID!,
      client_secret: process.env.SUPEROFFICE_CLIENT_SECRET!,
      refresh_token: refreshToken
    })
  });

  const data = (await res.json()) as RefreshedTokens;
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Token endpoint returned ${res.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auth.js configuration
// ---------------------------------------------------------------------------

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "superoffice",
      name: "SuperOffice",
      type: "oidc",
      issuer: ISSUER,
      clientId: process.env.SUPEROFFICE_CLIENT_ID,
      clientSecret: process.env.SUPEROFFICE_CLIENT_SECRET,
      // Request offline_access so the provider returns a refresh_token.
      // Users signed in before this change will need to sign in once more
      // to receive a refresh token stored in their session JWT.
      authorization: { params: { scope: "openid offline_access" } },
      // Providing an explicit token URL bypasses OIDC discovery, which would
      // otherwise throw because SuperOffice has no userinfo_endpoint in its
      // discovery document.
      token: TOKEN_URL,
      checks: ["pkce", "state"],
      // SuperOffice has no userinfo_endpoint.
      // Decode webapi_url from the ID token, then call currentPrincipal with
      // the access token.
      userinfo: {
        async request({ tokens }: { tokens: { id_token?: string; access_token?: string } }) {
          const { id_token, access_token } = tokens;
          if (!id_token) throw new Error("SuperOffice did not return an id_token");
          if (!access_token) throw new Error("SuperOffice did not return an access_token");

          const idClaims: Record<string, unknown> = JSON.parse(
            Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")
          );
          const webApiUrl = idClaims["http://schemes.superoffice.net/identity/webapi_url"] as string;
          if (!webApiUrl) throw new Error("webapi_url claim missing from SuperOffice id_token");

          const res = await fetch(`${webApiUrl}v1/User/currentPrincipal`, {
            headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" }
          });
          if (!res.ok) throw new Error(`currentPrincipal returned ${res.status}`);
          const principal = (await res.json()) as Record<string, unknown>;

          return { ...idClaims, ...principal };
        }
      },
      profile(profile) {
        const p = profile as Record<string, unknown>;
        return {
          id: (p["UserName"] ?? p.sub) as string,
          name: (p["FullName"] ?? p["UserName"] ?? p.sub) as string,
          email: (p["EMailAddress"] ?? p["http://schemes.superoffice.net/identity/email"]) as string ?? null
        };
      }
    }
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // ── Initial sign-in ──────────────────────────────────────────────────
      if (account && profile) {
        const p = profile as Record<string, unknown>;
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // expires_at from the provider is a Unix timestamp in seconds
          expiresAt: account.expires_at,
          webApiUrl: p["http://schemes.superoffice.net/identity/webapi_url"],
          ctx: p["http://schemes.superoffice.net/identity/ctx"],
          companyName: p["http://schemes.superoffice.net/identity/company_name"],
          systemUserToken: p["http://schemes.superoffice.net/identity/system_token"],
          error: undefined
        };
      }

      // ── Subsequent calls: return token if still valid ────────────────────
      // Allow a 60-second buffer before the real expiry.
      const expiresAt = token["expiresAt"] as number | undefined;
      if (!expiresAt || Date.now() / 1000 < expiresAt - 60) {
        return token;
      }

      // ── Access token expired — attempt refresh ───────────────────────────
      const refreshToken = token["refreshToken"] as string | undefined;
      if (!refreshToken) {
        console.warn("[auth] Access token expired but no refresh_token stored. User must sign in again.");
        return { ...token, error: "RefreshTokenMissing" };
      }

      try {
        console.log("[auth] Access token expired — refreshing via refresh_token...");
        const refreshed = await refreshAccessToken(refreshToken);
        console.log("[auth] Token refreshed successfully.");
        return {
          ...token,
          accessToken: refreshed.access_token,
          // Rotate: use the new refresh token if the provider returns one
          refreshToken: refreshed.refresh_token ?? refreshToken,
          expiresAt: refreshed.expires_in
            ? Math.floor(Date.now() / 1000) + refreshed.expires_in
            : undefined,
          error: undefined
        };
      } catch (err) {
        console.error("[auth] Token refresh failed:", (err as Error).message);
        return { ...token, error: "RefreshTokenError" };
      }
    },

    session({ session, token }) {
      session.accessToken = (token["accessToken"] as string) ?? "";
      session.webApiUrl = (token["webApiUrl"] as string) ?? "";
      session.ctx = (token["ctx"] as string) ?? "";
      session.companyName = (token["companyName"] as string) ?? "";
      session.systemUserToken = (token["systemUserToken"] as string) ?? undefined;
      session.error = token["error"] as "RefreshTokenError" | "RefreshTokenMissing" | undefined;
      return session;
    }
  },
  pages: {
    signIn: "/login"
  },
  session: { strategy: "jwt" }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
