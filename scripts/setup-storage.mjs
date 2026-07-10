// One-off script to create the public "project-logos" storage bucket.
// Usage: node scripts/setup-storage.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2];
  }
}

loadEnvLocal();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKET = "project-logos";

async function main() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "2MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  });
  if (error) throw error;
  console.log(`Bucket "${BUCKET}" created.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
