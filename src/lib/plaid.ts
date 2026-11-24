import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid/legacy";

// Server-side Plaid helpers. Env:
//   PLAID_CLIENT_ID, PLAID_SECRET          required
//   PLAID_ENV                              sandbox | production (default sandbox)
//   PLAID_TOKEN_KEY                        optional 64-hex-char key for access-token encryption
//   PLAID_WEBHOOK_URL                      optional, e.g. https://www.flowycash.com/api/plaid/webhook
//   PLAID_REDIRECT_URI                     optional, needed for OAuth banks in production

export const PLAID_ENV = (process.env.PLAID_ENV || "sandbox") as "sandbox" | "production";

export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

let client: PlaidApi | null = null;
export function plaid(): PlaidApi {
  if (client) return client;
  const basePath = PLAID_ENV === "production" ? PlaidEnvironments.production : PlaidEnvironments.sandbox;
  client = new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID || "",
        "PLAID-SECRET": process.env.PLAID_SECRET || "",
        "Plaid-Version": "2020-09-14",
      },
    },
  }));
  return client;
}

export const LINK_PRODUCTS = [Products.Transactions];
export const LINK_COUNTRIES = [CountryCode.Us];

// ── access-token encryption (AES-256-GCM) ────────────────────────────────────
function key(): Buffer {
  const hex = process.env.PLAID_TOKEN_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  // Derived fallback so sandbox works without another env var. Production
  // should set PLAID_TOKEN_KEY so rotating the Clerk secret does not orphan tokens.
  return createHash("sha256").update(`plaid:${process.env.CLERK_SECRET_KEY || "dev"}`).digest();
}
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
export function decryptToken(stored: string): string {
  const [v, ivB, tagB, encB] = stored.split(".");
  if (v !== "v1") throw new Error("bad token format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  d.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([d.update(Buffer.from(encB, "base64url")), d.final()]).toString("utf8");
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
