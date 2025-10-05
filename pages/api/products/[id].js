// pages/api/products/[id].js
import Product from "@/models/Product";
import User from "@/models/User";
import Order from "@/models/Order";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  // [PARAMETER TAMPERING FIX] - Validate product ID format
  if (!req.query.id || !isValidObjectId(req.query.id)) {
    return res.status(400).json({ message: "Invalid product ID format" });
  }

  if (req.method === "GET") {
    return getHandler(req, res);
  } else if (req.method === "PUT") {
    return putHandler(req, res);
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
};

const getHandler = async (req, res) => {
  try {
    await db.connect();
    const product = await Product.findOne({
      _id: req.query.id,
      isDeleted: { $ne: true }
    });

    if (!product) {
      await db.disconnect();
      return res.status(404).json({ message: "Product not found" });
    }

    await db.disconnect();
    res.json(product);
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('product_retrieval_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const putHandler = async (req, res) => {
  // [BROKEN ACCESS CONTROL FIX] - Require authentication for rating
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required to rate products" });
  }

  try {
    await db.connect();

    // [BROKEN ACCESS CONTROL FIX] - Verify user from database
    const user = await User.findById(session.user._id);
    if (!user) {
      await db.disconnect();
      return res.status(401).json({ message: "Invalid user session" });
    }

    const product = await Product.findOne({
      _id: req.query.id,
      isDeleted: { $ne: true }
    });

    if (!product) {
      await db.disconnect();
      return res.status(404).json({ message: "Product not found" });
    }

    // [PARAMETER TAMPERING FIX] - Validate rating value
    const { rating, review } = req.body;

    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      await db.disconnect();
      return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
    }

    // [PARAMETER TAMPERING FIX] - Validate optional review
    const sanitizedReview = review ? review.toString().trim().substring(0, 1000) : '';

    // [IDOR FIX] - Check if user already rated this product
    const existingRating = await Product.findOne({
      _id: req.query.id,
      'userRatings.userId': session.user._id
    });

    if (existingRating) {
      await db.disconnect();
      return res.status(409).json({
        message: "You have already rated this product. Each user can rate a product only once."
      });
    }

    // [PARAMETER TAMPERING FIX] - Verify user purchased this product (recommended)
    const hasPurchased = await Order.findOne({
      user: session.user._id,
      'orderItems._id': req.query.id,
      isPaid: true
    });

    if (!hasPurchased) {
      await db.disconnect();
      return res.status(403).json({
        message: "You can only rate products you have purchased."
      });
    }

    // Initialize rating arrays if they don't exist
    if (!product.userRatings) product.userRatings = [];
    if (!product.ratings) product.ratings = [0, 0, 0, 0, 0];

    // Add user rating with audit trail
    const ratingData = {
      userId: session.user._id,
      userName: user.name,
      rating: rating,
      review: sanitizedReview,
      ratedAt: new Date(),
      verified: true // Verified purchase
    };

    product.userRatings.push(ratingData);

    // Update rating statistics
    const ratingIndex = 5 - rating; // Convert to array index (5-star = index 0)
    product.ratings[ratingIndex] += 1;
    product.totalRatings = (product.totalRatings || 0) + 1;
    product.rating = calculateWeightedRating(product.ratings);
    product.numReviews = product.userRatings.filter(r => r.review && r.review.length > 0).length;

    await product.save();
    await db.disconnect();

    auditLogger.logUserAction('product_rated', {
      userId: user._id,
      productId: product._id,
      rating: rating,
      hasReview: !!sanitizedReview
    });

    res.json({
      message: "Thank you for rating this product!",
      newRating: product.rating,
      totalRatings: product.totalRatings
    });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('rating_submission_error', { error: error.message });
    return res.status(500).json({ message: "Unable to submit rating" });
  }
};

// [PARAMETER TAMPERING FIX] - Helper functions
function calculateWeightedRating(ratingsArray) {
  const [star5, star4, star3, star2, star1] = ratingsArray;
  const totalVotes = star5 + star4 + star3 + star2 + star1;

  if (totalVotes === 0) return 0;

  const weightedSum = (5 * star5) + (4 * star4) + (3 * star3) + (2 * star2) + (1 * star1);
  return Math.round((weightedSum / totalVotes) * 100) / 100;
}

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;