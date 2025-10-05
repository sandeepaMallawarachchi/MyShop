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
    return res.status(401).json({ message: "Admin signin required" });
  }

  if (req.method === "GET") return getHandler(req, res);
  if (req.method === "POST") return postHandler(req, res);
  return res.status(400).json({ message: "Method not allowed" });
};

const getHandler = async (req, res) => {
  await db.connect();
  const products = await Product.find({});
  await db.disconnect();
  res.status(200).json(products);
};

const postHandler = async (req, res) => {
  await db.connect();
  const newProduct = new Product({
    name: "sample name",
    slug: "sample-name-" + Math.random(),
    image: req.body.image || "/image/default-image.svg",
    price: 0,
    category: "sample category",
    brand: "sample brand",
    countInStock: 0,
    description: "sample description",
    rating: 0,
    ratings: [0, 0, 0, 0, 0],
    totalRatings: 0,
    numReviews: 0,
    reviews: [],
    isFeatured: false,
    banner: "",
  });
  const product = await newProduct.save();
  await db.disconnect();
  res.status(201).json({ message: "Product created successfully", product });
};

export default handler;
