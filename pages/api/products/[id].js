import Product from "@/models/Product";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { verifyCsrfToken } from "@/utils/csrf";

const handler = async (req, res) => {
  const csrfToken = req.headers["x-csrf-token"];
  if (!verifyCsrfToken(csrfToken)) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  const session = await getSession({ req });
  if (!session || !session.user?.isAdmin) {
    return res.status(403).json({ message: "Admin privileges required" });
  }

  if (req.method === "GET") return getHandler(req, res);
  if (req.method === "PUT") return putHandler(req, res);
  return res.status(405).json({ message: "Method not allowed" });
};

const getHandler = async (req, res) => {
  await db.connect();
  const product = await Product.findById(req.query.id);
  await db.disconnect();
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.send(product);
};

function calculateRatings(star5, star4, star3, star2, star1) {
  return (
    (5 * star5 + 4 * star4 + 3 * star3 + 2 * star2 + 1 * star1) /
    (star5 + star4 + star3 + star2 + star1)
  );
}

const putHandler = async (req, res) => {
  await db.connect();
  const product = await Product.findById(req.query.id);
  if (!product) {
    await db.disconnect();
    return res.status(404).json({ message: "Product not found" });
  }

  const [star5, star4, star3, star2, star1] = product.ratings;
  if (req.body.rating === 5) product.ratings[0] = star5 + 1;
  else if (req.body.rating === 4) product.ratings[1] = star4 + 1;
  else if (req.body.rating === 3) product.ratings[2] = star3 + 1;
  else if (req.body.rating === 2) product.ratings[3] = star2 + 1;
  else product.ratings[4] = star1 + 1;

  product.totalRatings += 1;
  product.rating = calculateRatings(...product.ratings);

  await product.save();
  await db.disconnect();
  return res.send({ message: "Ratings updated successfully" });
};

export default handler;
