import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { cloudinary } from "./cloudinary.js";
import { env } from "../config/env.js";

const LOCAL_ROOT = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
}

function resolveWithinRoot(storageKey) {
  const resolvedRoot = path.resolve(LOCAL_ROOT);
  const resolvedPath = path.resolve(
    path.join(LOCAL_ROOT, storageKey)
  );

  if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Invalid storage key");
  }

  return resolvedPath;
}

function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: options.prefix,
        public_id: options.publicId,
        use_filename: false,
        unique_filename: false,
        overwrite: false,
        type: "authenticated",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    upload.end(buffer);
  });
}

export async function saveFile(
  buffer,
  { prefix, filename, contentType }
) {
  const safeFilename = sanitizeFilename(filename);

  const uniqueId = crypto.randomUUID();

  const year = new Date().getUTCFullYear();

  const storageKey = `${prefix}/${year}/${uniqueId}-${safeFilename}`;

  if (env.STORAGE_PROVIDER === "cloudinary") {
    const result = await uploadToCloudinary(buffer, {
      prefix,
      publicId: `${year}/${uniqueId}-${safeFilename}`,
    });

    return result.public_id;
  }

  const fullPath = resolveWithinRoot(storageKey);

  await fs.mkdir(path.dirname(fullPath), {
    recursive: true,
  });

  await fs.writeFile(fullPath, buffer);

  return storageKey;
}

const FILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FILE_CACHE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const fileCache = new Map();
const pendingReads = new Map();

let cachedBytes = 0;

function getCachedFile(storageKey) {
  const entry = fileCache.get(storageKey);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    fileCache.delete(storageKey);
    cachedBytes -= entry.bytes.length;
    return null;
  }

  // Refresh insertion order for simple LRU eviction.
  fileCache.delete(storageKey);
  fileCache.set(storageKey, entry);

  return entry.bytes;
}

function cacheFile(storageKey, bytes) {
  if (bytes.length > FILE_CACHE_MAX_BYTES) return;

  const existing = fileCache.get(storageKey);

  if (existing) {
    cachedBytes -= existing.bytes.length;
    fileCache.delete(storageKey);
  }

  while (
    cachedBytes + bytes.length > FILE_CACHE_MAX_BYTES &&
    fileCache.size > 0
  ) {
    const oldestKey = fileCache.keys().next().value;
    const oldest = fileCache.get(oldestKey);

    fileCache.delete(oldestKey);
    cachedBytes -= oldest.bytes.length;
  }

  fileCache.set(storageKey, {
    bytes,
    expiresAt: Date.now() + FILE_CACHE_TTL_MS,
  });

  cachedBytes += bytes.length;
}

export function invalidateFileCache(storageKey) {
  const entry = fileCache.get(storageKey);

  if (entry) {
    fileCache.delete(storageKey);
    cachedBytes -= entry.bytes.length;
  }
}

export async function readFile(storageKey) {
  if (env.STORAGE_PROVIDER !== "cloudinary") {
    return fs.readFile(resolveWithinRoot(storageKey));
  }

  const cached = getCachedFile(storageKey);

  if (cached) {
    console.log(`[Storage] Cache HIT: ${storageKey}`);
    return cached;
  }

  // Reuse an ongoing download for the same file.
  const pending = pendingReads.get(storageKey);

  if (pending) {
    return pending;
  }

  const downloadPromise = (async () => {
    const startedAt = performance.now();

    const dotIndex = storageKey.lastIndexOf(".");

    if (dotIndex === -1) {
      throw new Error("Cloudinary raw file has no extension");
    }

    const publicId = storageKey;
    const format = storageKey.slice(dotIndex + 1);

    const signedUrl = cloudinary.utils.private_download_url(
      publicId,
      format,
      {
        resource_type: "raw",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
    );

    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download Cloudinary asset: ${response.status}`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    cacheFile(storageKey, bytes);

    console.log(
      `[Storage] Cloudinary download: ${storageKey}, ` +
        `${(performance.now() - startedAt).toFixed(0)} ms, ` +
        `${(bytes.length / 1024).toFixed(0)} KB`,
    );

    return bytes;
  })();

  pendingReads.set(storageKey, downloadPromise);

  try {
    return await downloadPromise;
  } finally {
    if (pendingReads.get(storageKey) === downloadPromise) {
      pendingReads.delete(storageKey);
    }
  }
}

export async function deleteFile(storageKey) {
  if (env.STORAGE_PROVIDER === "cloudinary") {
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: "raw",
      type: "authenticated",
    });

    invalidateFileCache(storageKey);
    return;
  }

  await fs.rm(resolveWithinRoot(storageKey), {
    force: true,
  });
}