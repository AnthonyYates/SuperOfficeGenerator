import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    webApiUrl: string;
    ctx: string;              // tenant context id from SuperOffice
    companyName: string;      // tenant company name
    systemUserToken?: string; // system_token claim — present when "Server to server" is enabled
  }
}

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "superoffice",
      name: "SuperOffice",
      type: "oidc",
      issuer: process.env.SUPEROFFICE_ISSUER ?? "https://sod.superoffice.com",
      clientId: process.env.SUPEROFFICE_CLIENT_ID,
      clientSecret: process.env.SUPEROFFICE_CLIENT_SECRET,
      authorization: { params: { scope: "openid" } },
      // Providing an explicit token URL bypasses OIDC discovery, which would otherwise
      // throw because SuperOffice has no userinfo_endpoint in its discovery document.
      token: `${process.env.SUPEROFFICE_ISSUER ?? "https://sod.superoffice.com"}/login/common/oauth/tokens`,
      checks: ["pkce", "state"],
      // SuperOffice has no userinfo_endpoint.
      // Decode webapi_url from the ID token, then call currentPrincipal with the access token.
      userinfo: {
        async request({ tokens }: { tokens: { id_token?: string; access_token?: string } }) {
          const { id_token, access_token } = tokens;
          if (!id_token) throw new Error("SuperOffice did not return an id_token");
          if (!access_token) throw new Error("SuperOffice did not return an access_token");

          // Extract webapi_url from the ID token payload (needed to build the API URL)
          const idClaims: Record<string, unknown> = JSON.parse(
            Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")
          );
          const webApiUrl = idClaims["http://schemes.superoffice.net/identity/webapi_url"] as string;
          if (!webApiUrl) throw new Error("webapi_url claim missing from SuperOffice id_token");

          // Fetch the full user principal from the SuperOffice REST API
          const res = await fetch(`${webApiUrl}v1/User/currentPrincipal`, {
            headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" }
          });
          if (!res.ok) throw new Error(`currentPrincipal returned ${res.status}`);
          const principal = (await res.json()) as Record<string, unknown>;

          // Merge: id token claims supply infrastructure fields (webapi_url, ctx, etc.),
          // principal supplies user identity fields (UserName, FullName, Email, etc.)
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
    jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as Record<string, unknown>;
        token.accessToken = account.access_token;
        token.webApiUrl = p["http://schemes.superoffice.net/identity/webapi_url"] as string;
        token.ctx = p["http://schemes.superoffice.net/identity/ctx"] as string;
        token.companyName = p["http://schemes.superoffice.net/identity/company_name"] as string;
        token.systemUserToken = p["http://schemes.superoffice.net/identity/system_token"] as string | undefined;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = (token.accessToken as string) ?? "";
      session.webApiUrl = (token.webApiUrl as string) ?? "";
      session.ctx = (token.ctx as string) ?? "";
      session.companyName = (token.companyName as string) ?? "";
      session.systemUserToken = (token.systemUserToken as string) ?? undefined;
      return session;
    }
  },
  pages: {
    signIn: "/login"
  },
  session: { strategy: "jwt" }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
