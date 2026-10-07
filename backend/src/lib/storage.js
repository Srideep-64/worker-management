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

export async function readFile(storageKey) {
  if (env.STORAGE_PROVIDER === "cloudinary") {
    const dotIndex = storageKey.lastIndexOf(".");

    if (dotIndex === -1) {
      throw new Error(
        "Cloudinary raw file has no extension"
      );
    }

    // For Cloudinary raw assets, the extension is
    // part of the public_id.
    const publicId = storageKey;

    const format = storageKey.slice(dotIndex + 1);

    // Signed URL valid for 5 minutes.
    const expiresAt =
      Math.floor(Date.now() / 1000) + 300;

    const signedUrl =
      cloudinary.utils.private_download_url(
        publicId,
        format,
        {
          resource_type: "raw",
          type: "authenticated",
          expires_at: expiresAt,
        }
      );

    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download Cloudinary asset: ${response.status}`
      );
    }

    return Buffer.from(
      await response.arrayBuffer()
    );
  }

  return fs.readFile(
    resolveWithinRoot(storageKey)
  );
}

export async function deleteFile(storageKey) {
  if (env.STORAGE_PROVIDER === "cloudinary") {
    await cloudinary.uploader.destroy(
      storageKey,
      {
        resource_type: "raw",
        type: "authenticated",
      }
    );

    return;
  }

  await fs.rm(
    resolveWithinRoot(storageKey),
    {
      force: true,
    }
  );
}