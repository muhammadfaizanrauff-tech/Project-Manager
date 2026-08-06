import "server-only";
import { randomUUID } from "node:crypto";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Uploading a public image (project logo, organization logo, user avatar).
 *
 * Uses the service-role client because Storage has its own policy layer that
 * the anon key isn't granted — every caller here has already checked the
 * user's role first.
 *
 * The bucket is created on first use rather than requiring another run of
 * scripts/setup-storage.mjs. Buckets added after the initial setup would
 * otherwise silently 404 on an existing deployment, and "the logo just didn't
 * save" is a miserable thing to debug.
 */

const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

async function ensureBucket(bucket: string) {
  const service = createServiceClient();
  const { data } = await service.storage.getBucket(bucket);
  if (data) return;

  const { error } = await service.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: "2MB",
    allowedMimeTypes: Array.from(ALLOWED),
  });
  // A concurrent request may have created it a moment ago — that's fine.
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function uploadPublicImage(
  bucket: string,
  file: File,
  prefix = "",
): Promise<{ url?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};

  if (file.size > MAX_BYTES) {
    return { error: "That image is larger than 2 MB — try a smaller one." };
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return { error: "Use a PNG, JPEG, WebP or SVG image." };
  }

  try {
    await ensureBucket(bucket);
  } catch {
    return { error: "Could not reach image storage. Try again in a moment." };
  }

  const service = createServiceClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${prefix}${randomUUID()}.${ext}`;

  const { error } = await service.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (error) return { error: "Could not upload that image. Try a smaller file." };

  return { url: service.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

export const PROJECT_LOGO_BUCKET = "project-logos";
export const ORG_LOGO_BUCKET = "organization-logos";
export const AVATAR_BUCKET = "user-avatars";
