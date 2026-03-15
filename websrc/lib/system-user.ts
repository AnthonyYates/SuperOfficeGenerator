import "server-only";

import crypto from "crypto";

/**
 * System User authentication for SuperOffice Online.
 *
 * Flow:
 *  1. Sign the system_token claim from the OIDC id_token with your RSA private key
 *  2. POST the signed token to PartnerSystemUser/Authenticate
 *  3. Decode the returned JWT to extract the SOTicket credential
 *  4. Use that ticket as `Authorization: SOTicket <ticket>` + `SO-AppToken: <clientSecret>`
 *
 * Required env vars:
 *   SUPEROFFICE_CLIENT_SECRET  — your app's client secret (used as ApplicationToken)
 *   SUPEROFFICE_PRIVATE_KEY    — RSA private key in XML format (from SuperOffice Developer Portal)
 *                                OR PEM format (PKCS#1 / PKCS#8).
 *                                XML keys look like: <RSAKeyValue><Modulus>...</Modulus>...</RSAKeyValue>
 *                                Literal \n separators in the env var are supported for PEM.
 */

interface CachedTicket {
  ticket: string;
  expiresAt: number;
}

// Cache keyed by contextIdentifier (tenant ID, e.g. "Cust26759")
const ticketCache = new Map<string, CachedTicket>();

// Refresh 1 hour before the 6-hour expiry
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;

// ─── Key format helpers ───────────────────────────────────────────────────────

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function isXmlKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.startsWith("<RSAKeyValue>") || trimmed.startsWith("<rsa");
}

/**
 * Convert a SuperOffice XML RSA private key to a Node.js KeyObject.
 * The XML format is: <RSAKeyValue><Modulus>..</Modulus><Exponent>..</Exponent>
 *   <D>..</D><P>..</P><Q>..</Q><DP>..</DP><DQ>..</DQ><InverseQ>..</InverseQ></RSAKeyValue>
 * All values are standard Base64 (not URL-safe). We convert to Base64URL for JWK.
 */
function xmlKeyToKeyObject(xmlKey: string): crypto.KeyObject {
  const extract = (tag: string): string => {
    const re = new RegExp(`<${tag}>([\\s\\S]+?)<\\/${tag}>`, "i");
    const match = xmlKey.match(re);
    if (!match) throw new Error(`XML private key is missing <${tag}> element`);
    // Convert standard Base64 → Base64URL (no padding)
    return match[1].trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  console.log("[system-user] Parsing XML RSA private key...");
  const jwk = {
    kty: "RSA",
    n: extract("Modulus"),
    e: extract("Exponent"),
    d: extract("D"),
    p: extract("P"),
    q: extract("Q"),
    dp: extract("DP"),
    dq: extract("DQ"),
    qi: extract("InverseQ")
  };
  console.log("[system-user] XML key parsed — modulus length (Base64URL chars):", jwk.n.length);
  return crypto.createPrivateKey({ key: jwk, format: "jwk" });
}

function loadPrivateKey(rawKey: string): crypto.KeyObject {
  if (isXmlKey(rawKey)) {
    console.log("[system-user] Key format: XML (RSAKeyValue) — converting to JWK");
    return xmlKeyToKeyObject(rawKey);
  }

  const pem = normalizePem(rawKey);
  const header = pem.split("\n")[0];
  console.log("[system-user] Key format: PEM — header:", header);
  return crypto.createPrivateKey(pem);
}

// ─── Token signing ────────────────────────────────────────────────────────────

/**
 * Build the signed token: `<systemUserToken>.<YYYYMMDDHHmm>.<Base64(RSA-SHA256-sig)>`
 * Signing algorithm: RSA-SHA256 with PKCS1v15 padding (Node.js default for RSA sign).
 */
function buildSignedToken(systemUserToken: string, rawKey: string): string {
  const utcNow = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp =
    String(utcNow.getUTCFullYear()) +
    pad(utcNow.getUTCMonth() + 1) +
    pad(utcNow.getUTCDate()) +
    pad(utcNow.getUTCHours()) +
    pad(utcNow.getUTCMinutes());

  const payload = `${systemUserToken}.${timestamp}`;
  console.log("[system-user] Payload to sign:", payload);

  const keyObject = loadPrivateKey(rawKey);
  const signer = crypto.createSign("SHA256");
  signer.update(payload, "utf8");
  const signature = signer.sign(keyObject, "base64");

  console.log("[system-user] Signature (first 20 chars):", signature.slice(0, 20) + "...");
  return `${payload}.${signature}`;
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

/** Decode a JWT payload without signature verification (we trust the HTTPS response body). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadB64] = token.split(".");
  const json = Buffer.from(payloadB64, "base64url").toString("utf8");
  return JSON.parse(json);
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Extract the SuperOffice environment subdomain from the webApiUrl claim. */
export function extractEnv(webApiUrl: string): string {
  try {
    // e.g. "https://sod.superoffice.com/Cust26759/api/" → "sod"
    return new URL(webApiUrl).hostname.split(".")[0];
  } catch {
    return "sod";
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Returns a cached SOTicket credential for the given tenant, refreshing it when expired.
 *
 * @param systemUserToken  The `http://schemes.superoffice.net/identity/system_token` claim
 *                         from the OIDC id_token.
 * @param contextIdentifier  The tenant ID, e.g. "Cust26759".
 * @param env  SuperOffice environment subdomain: "sod" | "qastage" | "online".
 */
export async function getSystemUserTicket(
  systemUserToken: string,
  contextIdentifier: string,
  env: string
): Promise<string> {
  console.log(`[system-user] getSystemUserTicket — tenant: ${contextIdentifier}, env: ${env}`);

  const cached = ticketCache.get(contextIdentifier);
  if (cached && Date.now() < cached.expiresAt) {
    console.log("[system-user] Returning cached ticket (expires in", Math.round((cached.expiresAt - Date.now()) / 60000), "min)");
    return cached.ticket;
  }

  const clientSecret = process.env.SUPEROFFICE_CLIENT_SECRET;
  const rawPrivateKey = process.env.SUPEROFFICE_PRIVATE_KEY;

  if (!clientSecret) throw new Error("SUPEROFFICE_CLIENT_SECRET is not set");
  if (!rawPrivateKey) {
    throw new Error(
      "SUPEROFFICE_PRIVATE_KEY is not set. Add your RSA private key (XML or PEM format) " +
        "from the SuperOffice Developer Portal to .env.local."
    );
  }

  console.log("[system-user] systemUserToken (first 30 chars):", systemUserToken.slice(0, 30));
  console.log("[system-user] Raw key length:", rawPrivateKey.length, "chars");
  console.log("[system-user] Raw key start:", rawPrivateKey.slice(0, 40).replace(/\n/g, "\\n"));

  let signedToken: string;
  try {
    signedToken = buildSignedToken(systemUserToken, rawPrivateKey);
  } catch (err) {
    console.error("[system-user] buildSignedToken failed:", err);
    throw new Error(`Failed to sign system user token: ${(err as Error).message}`);
  }

  console.log("[system-user] Signed token (first 60 chars):", signedToken.slice(0, 60));

  const url = `https://${env}.superoffice.com/Login/api/PartnerSystemUser/Authenticate`;
  console.log("[system-user] POST", url);

  const requestBody = {
    SignedSystemToken: signedToken,
    ApplicationToken: clientSecret,
    ContextIdentifier: contextIdentifier,
    ReturnTokenType: "JWT"
  };
  console.log("[system-user] Request body (token redacted):", {
    ...requestBody,
    SignedSystemToken: signedToken.slice(0, 40) + "...",
    ApplicationToken: clientSecret.slice(0, 6) + "..."
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(requestBody)
  });

  console.log("[system-user] HTTP response status:", res.status, res.statusText);

  const rawBody = await res.text();
  console.log("[system-user] Raw response body:", rawBody.slice(0, 500));

  if (!res.ok) {
    throw new Error(`PartnerSystemUser/Authenticate returned HTTP ${res.status}: ${rawBody.slice(0, 200)}`);
  }

  const data = JSON.parse(rawBody) as {
    IsSuccessful: boolean;
    Token?: string;
    ErrorMessage?: string;
  };

  console.log("[system-user] IsSuccessful:", data.IsSuccessful);
  if (data.ErrorMessage) console.log("[system-user] ErrorMessage:", data.ErrorMessage);

  if (!data.IsSuccessful || !data.Token) {
    throw new Error(
      `System user authentication failed: ${data.ErrorMessage ?? "no error message returned"}`
    );
  }

  console.log("[system-user] JWT received — decoding ticket claim...");
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(data.Token);
  } catch (err) {
    throw new Error(`Failed to decode system user JWT: ${(err as Error).message}`);
  }

  console.log("[system-user] JWT claims keys:", Object.keys(claims).join(", "));

  const ticket = claims["http://schemes.superoffice.net/identity/ticket"] as string;
  if (!ticket) {
    throw new Error("System user JWT does not contain a ticket claim");
  }

  console.log("[system-user] Ticket obtained (first 10 chars):", ticket.slice(0, 10) + "...");
  ticketCache.set(contextIdentifier, { ticket, expiresAt: Date.now() + CACHE_TTL_MS });
  return ticket;
}
