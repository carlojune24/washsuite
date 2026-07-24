/**
 * Password hashing via the Web Crypto API (SHA-256 + per-user random salt), stored as a single
 * "salt:hex" string. This is basic protection appropriate for a local single-device app — not
 * bcrypt/scrypt-grade, but avoids storing plain-text passwords without adding a new dependency.
 */

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string, salt: string = crypto.randomUUID()): Promise<string> {
  const hash = await sha256Hex(`${salt}:${password}`);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const salt = stored.split(":")[0];
  if (!salt) return false;
  const attempt = await hashPassword(password, salt);
  return attempt === stored;
}
