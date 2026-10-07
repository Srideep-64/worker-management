import argon2 from "argon2";

// argon2id is the recommended variant: resistant to both GPU cracking and
// side-channel attacks. Defaults chosen by the library are already sane for
// argon2id; we don't hand-tune memory/time cost here.
export function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // argon2.verify throws on a malformed hash rather than returning false.
    return false;
  }
}

/**
 * Emails are matched case-insensitively without adding a Postgres `citext`
 * column: we always normalize to lowercase before writing or querying, and
 * the `email` column has a plain unique constraint. Trade-off: a direct SQL
 * query bypassing this helper could violate the invariant, so all reads/writes
 * of user email MUST go through this function.
 */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
