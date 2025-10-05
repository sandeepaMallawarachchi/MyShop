// pages/api/orders/index.js
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // [BROKEN ACCESS CONTROL FIX] - Enhanced authentication
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    await db.connect();

    // [BROKEN ACCESS CONTROL FIX] - Verify user from database
    const user = await User.findById(session.user._id);
    if (!user) {
      await db.disconnect();
      return res.status(401).json({ message: "Invalid user session" });
    }

    // [PARAMETER TAMPERING FIX] - Validate required order fields
    const { orderItems, shippingAddress, paymentMethod } = req.body;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0 || orderItems.length > 50) {
      await db.disconnect();
      return res.status(400).json({ message: "Order items are required (max 50 items)" });
    }

    if (!shippingAddress || typeof shippingAddress !== 'object') {
      await db.disconnect();
      return res.status(400).json({ message: "Shipping address is required" });
    }

    if (!paymentMethod || typeof paymentMethod !== 'string') {
      await db.disconnect();
      return res.status(400).json({ message: "Payment method is required" });
    }

    // [PARAMETER TAMPERING FIX] - Validate shipping address
    const requiredAddressFields = ['fullName', 'address', 'city', 'postalCode', 'country'];
    for (const field of requiredAddressFields) {
      if (!shippingAddress[field] || typeof shippingAddress[field] !== 'string' || shippingAddress[field].trim().length === 0) {
        await db.disconnect();
        return res.status(400).json({ message: `Invalid shipping address: ${field} is required` });
      }
    }

    // [PARAMETER TAMPERING FIX] - Validate payment method
    const allowedPaymentMethods = ['PayPal', 'Stripe', 'CashOnDelivery'];
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      await db.disconnect();
      return res.status(400).json({
        message: `Invalid payment method. Allowed: ${allowedPaymentMethods.join(', ')}`
      });
    }

    // [PARAMETER TAMPERING FIX] - Server-side price calculation (NEVER trust client)
    let calculatedItemsPrice = 0;
    const validatedOrderItems = [];
    const stockUpdates = [];

    for (const item of orderItems) {
      // [PARAMETER TAMPERING FIX] - Validate each order item
      if (!item._id || !isValidObjectId(item._id) || !item.quantity || item.quantity < 1 || item.quantity > 100) {
        await db.disconnect();
        return res.status(400).json({ message: "Invalid order item data" });
      }

      // [PARAMETER TAMPERING FIX] - Fetch current product data from database
      const product = await Product.findOne({
        _id: item._id,
        isDeleted: { $ne: true }
      });

      if (!product) {
        await db.disconnect();
        return res.status(404).json({ message: `Product not found: ${item._id}` });
      }

      // [PARAMETER TAMPERING FIX] - Validate stock availability
      if (product.countInStock < item.quantity) {
        await db.disconnect();
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}. Available: ${product.countInStock}, Requested: ${item.quantity}`
        });
      }

      // [PARAMETER TAMPERING FIX] - Use server-side price, NEVER client-provided price
      const itemTotal = product.price * item.quantity;
      calculatedItemsPrice += itemTotal;

      validatedOrderItems.push({
        _id: product._id,
        name: product.name,
        slug: product.slug,
        image: product.image,
        price: product.price, // Server-side price
        quantity: Math.floor(item.quantity),
        category: product.category,
        brand: product.brand
      });

      // Prepare stock update
      stockUpdates.push({
        productId: product._id,
        newStock: product.countInStock - item.quantity
      });
    }

    // [PARAMETER TAMPERING FIX] - Server-side calculation of ALL prices
    const taxRate = 0.15; // 15% tax
    const freeShippingThreshold = 200;
    const shippingCost = 25;

    const calculatedTaxPrice = Math.round(calculatedItemsPrice * taxRate * 100) / 100;
    const calculatedShippingPrice = calculatedItemsPrice >= freeShippingThreshold ? 0 : shippingCost;
    const calculatedTotalPrice = Math.round((calculatedItemsPrice + calculatedTaxPrice + calculatedShippingPrice) * 100) / 100;

    // Use database transaction for atomicity
    const session_db = await db.mongoose.startSession();
    session_db.startTransaction();

    try {
      // Create order with validated data
      const newOrder = new Order({
        orderItems: validatedOrderItems,
        shippingAddress: {
          fullName: shippingAddress.fullName.trim().substring(0, 100),
          address: shippingAddress.address.trim().substring(0, 200),
          city: shippingAddress.city.trim().substring(0, 50),
          postalCode: shippingAddress.postalCode.trim().substring(0, 20),
          country: shippingAddress.country.trim().substring(0, 50),
        },
        paymentMethod: paymentMethod.trim().substring(0, 50),
        itemsPrice: calculatedItemsPrice,
        taxPrice: calculatedTaxPrice,
        shippingPrice: calculatedShippingPrice,
        totalPrice: calculatedTotalPrice,
        user: session.user._id,
        isPaid: false, // Always false on creation
        isDelivered: false, // Always false on creation
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const order = await newOrder.save({ session: session_db });

      // Update stock levels atomically
      for (const update of stockUpdates) {
        await Product.findByIdAndUpdate(
            update.productId,
            { countInStock: update.newStock },
            { session: session_db }
        );
      }

      await session_db.commitTransaction();
      await session_db.endSession();
      await db.disconnect();

      auditLogger.logUserAction('order_created', {
        userId: user._id,
        orderId: order._id,
        totalPrice: calculatedTotalPrice,
        itemCount: validatedOrderItems.length
      });

      res.status(201).json({
        message: "Order created successfully",
        orderId: order._id,
        totalPrice: calculatedTotalPrice
      });

    } catch (transactionError) {
      await session_db.abortTransaction();
      await session_db.endSession();
      throw transactionError;
    }

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('order_creation_error', {
      error: error.message,
      userId: session?.user?._id
    });
    return res.status(500).json({ message: "Unable to process order. Please try again." });
  }
};

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;