// One-off script to provision the Admin account.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node scripts/seed-admin.mjs
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

function loadEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2];
  }
}

function encryptPassword(plain, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY;

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || "Faizan Rauf";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing Supabase config in .env.local");
  process.exit(1);
}
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const already = existing?.users?.find((u) => u.email === email);

  let userId;
  if (already) {
    console.log("User already exists, updating password + metadata:", already.id);
    const { error } = await supabase.auth.admin.updateUserById(already.id, {
      password,
      user_metadata: { full_name: fullName, role: "admin" },
      email_confirm: true,
    });
    if (error) throw error;
    userId = already.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("Created auth user:", userId);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, role: "admin" });
  if (profileError) throw profileError;
  console.log("Profile set to admin.");

  const encrypted = encryptPassword(password, ENCRYPTION_KEY);
  const { error: credError } = await supabase
    .from("credentials")
    .upsert({ user_id: userId, encrypted_password: encrypted, updated_at: new Date().toISOString() });
  if (credError) throw credError;
  console.log("Encrypted credential stored.");

  console.log("\nDone. Admin account ready:", email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
