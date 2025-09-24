// pages/api/admin/orders/[id]/deliver.js
import Order from "@/models/Order";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // [BROKEN ACCESS CONTROL FIX] - Enhanced admin authentication
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

    // [BROKEN ACCESS CONTROL FIX] - Verify admin from database
    const admin = await User.findById(session.user._id);
    if (!admin || !admin.isAdmin) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('admin_delivery_access', {
        userId: session.user._id,
        orderId: req.query.id
      });
      return res.status(403).json({ message: "Admin privileges required" });
    }

    const order = await Order.findById(req.query.id).populate('user', 'name email');
    if (!order) {
      await db.disconnect();
      return res.status(404).json({ message: "Order not found" });
    }

    // [PARAMETER TAMPERING FIX] - Comprehensive business logic validation
    if (!order.isPaid) {
      await db.disconnect();
      return res.status(400).json({
        message: "Cannot deliver unpaid order. Payment must be confirmed first."
      });
    }

    if (order.isDelivered) {
      await db.disconnect();
      return res.status(400).json({
        message: "Order is already marked as delivered",
        deliveredAt: order.deliveredAt
      });
    }

    if (order.status === 'cancelled') {
      await db.disconnect();
      return res.status(400).json({ message: "Cannot deliver cancelled order" });
    }

    // [PARAMETER TAMPERING FIX] - Validate shipping address completeness
    const requiredAddressFields = ['fullName', 'address', 'city', 'country'];
    for (const field of requiredAddressFields) {
      if (!order.shippingAddress[field]) {
        await db.disconnect();
        return res.status(400).json({
          message: `Incomplete shipping address: ${field} is missing`
        });
      }
    }

    // [PARAMETER TAMPERING FIX] - Validate delivery timing
    const deliveryDate = new Date();
    const orderDate = new Date(order.createdAt);
    const timeDiff = deliveryDate - orderDate;

    if (timeDiff < 0) {
      await db.disconnect();
      return res.status(400).json({ message: "Cannot set delivery date before order date" });
    }

    // Flag suspicious same-day delivery for non-express orders
    if (timeDiff < 24 * 60 * 60 * 1000 && !order.isExpress) {
      auditLogger.logSecurityViolation('suspicious_fast_delivery', {
        orderId: order._id,
        adminId: admin._id,
        timeDiff: timeDiff,
        orderDate: orderDate,
        deliveryDate: deliveryDate
      });
    }

    // Validate delivery notes if provided
    let deliveryNotes = '';
    if (req.body.notes && typeof req.body.notes === 'string') {
      deliveryNotes = req.body.notes.trim().substring(0, 500);
    }

    // Update delivery status with audit trail
    order.isDelivered = true;
    order.deliveredAt = deliveryDate;
    order.deliveredBy = admin._id;
    order.deliveryNotes = deliveryNotes;
    order.status = 'delivered';

    const deliveredOrder = await order.save();
    await db.disconnect();

    auditLogger.logAdminAction('order_delivered', {
      adminId: admin._id,
      orderId: order._id,
      customerId: order.user._id,
      deliveryTime: timeDiff
    });

    res.json({
      message: "Order marked as delivered successfully",
      orderId: deliveredOrder._id,
      deliveredAt: deliveredOrder.deliveredAt
    });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('order_delivery_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;