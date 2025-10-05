import crypto from "crypto";

const SECRET = process.env.CSRF_SECRET || "my_csrf_secret_key";

export function generateCsrfToken() {
  const timestamp = Date.now();
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(String(timestamp));
  const hash = hmac.digest("hex");
  return `${timestamp}:${hash}`;
}

export function verifyCsrfToken(token) {
  if (!token) return false;
  const [timestamp, hash] = token.split(":");
  if (!timestamp || !hash) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(String(timestamp));
  const expected = hmac.digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(expected)
  );

  const age = Date.now() - Number(timestamp);
  return isValid && age < 60 * 60 * 1000;
}
