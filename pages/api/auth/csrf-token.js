import { generateCsrfToken } from "@/utils/csrf";

export default function handler(req, res) {
  const token = generateCsrfToken();
  return res.status(200).json({ csrfToken: token });
}
