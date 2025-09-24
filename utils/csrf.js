import crypto from "crypto";

const tokens = new Set();

export function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString("hex");
  tokens.add(token);
  setTimeout(() => tokens.delete(token), 60 * 60 * 1000);
  return token;
}

export function verifyCsrfToken(token) {
  return tokens.has(token);
}
