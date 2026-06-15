/**
 * Server-side verification of Cloudflare Turnstile tokens.
 *
 * The client widget generates a token that MUST be verified server-side
 * before trusting any user-submitted data. Client-only checks are trivially
 * bypassable via direct HTTP requests.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token against the Cloudflare API.
 *
 * - Returns `true` if the token is valid (human verified).
 * - Returns `true` in development when no secret key is configured (graceful fallback).
 * - Returns `false` if Cloudflare rejects the token (bot detected).
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // In development without Turnstile configured, allow all requests.
  // In production, TURNSTILE_SECRET_KEY MUST be set.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[security] TURNSTILE_SECRET_KEY is missing in production!");
      return false;
    }
    return true;
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });

    if (!res.ok) {
      console.error(`[security] Turnstile API returned ${res.status}`);
      return false;
    }

    const data: TurnstileVerifyResponse = await res.json();
    if (!data.success) {
      console.warn("[security] Turnstile rejected token:", data["error-codes"]);
    }
    return data.success;
  } catch (err) {
    console.error("[security] Turnstile verification failed:", err);
    return false; // Fail closed: reject on network errors
  }
}
