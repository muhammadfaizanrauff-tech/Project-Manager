import "server-only";
import crypto from "node:crypto";

function key() {
  return Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY!, "hex");
}

export function encryptPassword(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptPassword(encoded: string) {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// Same AES-256-GCM cipher, generalized to arbitrary JSON — used to stash the
// impersonator's own session tokens in a cookie while "switched to" someone
// else (see impersonate-actions.ts), not just passwords.
export function encryptJson(value: unknown) {
  return encryptPassword(JSON.stringify(value));
}

export function decryptJson<T>(encoded: string): T {
  return JSON.parse(decryptPassword(encoded)) as T;
}
