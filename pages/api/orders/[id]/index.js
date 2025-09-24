// pages/api/orders/[id]/index.js
import Order from "@/models/Order";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // [BROKEN ACCESS CONTROL FIX] - Enhanced authentication
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // [PARAMETER TAMPERING FIX] - Validate order ID format
  if (!req.query.id || !isValidObjectId(req.query.id)) {
    return res.status(400).json({ message: "Invalid order ID format" });
  }

  try {
    await db.connect();

    // [BROKEN ACCESS CONTROL FIX] - Verify user from database
    const user = await User.findById(session.user._id);
    if (!user) {
      await db.disconnect();
      return res.status(401).json({ message: "Invalid user session" });
    }

    let orderQuery;

    if (user.isAdmin) {
      // [IDOR FIX] - Admin can access any order with logging
      orderQuery = { _id: req.query.id };
      auditLogger.logAdminAction('admin_order_access', {
        adminId: user._id,
        orderId: req.query.id
      });
    } else {
      // [IDOR FIX] - Users can only access their own orders
      orderQuery = {
        _id: req.query.id,
        user: session.user._id
      };
    }

    const order = await Order.findOne(orderQuery).populate('user', 'name email');

    if (!order) {
      await db.disconnect();
      // [PARAMETER TAMPERING FIX] - Don't reveal if order exists for non-admins
      auditLogger.logUnauthorizedAccess('order_access_attempt', {
        userId: session.user._id,
        orderId: req.query.id,
        isAdmin: user.isAdmin
      });
      return res.status(404).json({
        message: user.isAdmin ? "Order not found" : "Order not found or access denied"
      });
    }

    // [IDOR FIX] - Double-check ownership for non-admins
    if (!user.isAdmin && order.user._id.toString() !== session.user._id) {
      await db.disconnect();
      auditLogger.logSecurityViolation('order_access_violation', {
        userId: session.user._id,
        orderId: req.query.id,
        orderOwner: order.user._id
      });
      return res.status(403).json({ message: "Access denied" });
    }

    await db.disconnect();

    // [PARAMETER TAMPERING FIX] - Sanitize response based on user role
    const sanitizedOrder = sanitizeOrderResponse(order, user.isAdmin);
    res.json(sanitizedOrder);

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('order_access_error', {
      error: error.message,
      userId: session?.user?._id,
      orderId: req.query.id
    });
    return res.status(500).json({ message: "Internal server error" });
  }
};

// [PARAMETER TAMPERING FIX] - Response sanitization
function sanitizeOrderResponse(order, isAdmin) {
  const baseOrder = {
    _id: order._id,
    orderItems: order.orderItems,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    itemsPrice: order.itemsPrice,
    taxPrice: order.taxPrice,
    shippingPrice: order.shippingPrice,
    totalPrice: order.totalPrice,
    isPaid: order.isPaid,
    isDelivered: order.isDelivered,
    status: order.status,
    createdAt: order.createdAt
  };

  // Add conditional fields
  if (order.isPaid) {
    baseOrder.paidAt = order.paidAt;
  }

  if (order.isDelivered) {
    baseOrder.deliveredAt = order.deliveredAt;
  }

  // Admin gets additional sensitive information
  if (isAdmin) {
    baseOrder.user = {
      _id: order.user._id,
      name: order.user.name,
      email: order.user.email
    };
    baseOrder.paymentResult = order.paymentResult;
    baseOrder.deliveryNotes = order.deliveryNotes;
    baseOrder.deliveredBy = order.deliveredBy;
  }

  return baseOrder;
}

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;