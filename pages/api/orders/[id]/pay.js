// pages/api/orders/[id]/pay.js
import Order from "@/models/Order";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== 'PUT') {
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

    // [IDOR FIX] - Only allow users to pay for their own orders
    const order = await Order.findOne({
      _id: req.query.id,
      user: session.user._id // Critical: Only user's own orders
    }).populate('user', 'name email');

    if (!order) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('unauthorized_payment_attempt', {
        userId: session.user._id,
        orderId: req.query.id
      });
      return res.status(404).json({ message: "Order not found or access denied" });
    }

    // [PARAMETER TAMPERING FIX] - Validate order state
    if (order.isPaid) {
      await db.disconnect();
      return res.status(400).json({ message: "Order is already paid" });
    }

    if (order.status === 'cancelled') {
      await db.disconnect();
      return res.status(400).json({ message: "Cannot pay for cancelled order" });
    }

    // Check if order is expired (older than 24 hours and unpaid)
    const orderAge = Date.now() - new Date(order.createdAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (orderAge > twentyFourHours && !order.isPaid) {
      await db.disconnect();
      return res.status(400).json({ message: "Order has expired. Please create a new order." });
    }

    // [PARAMETER TAMPERING FIX] - Comprehensive payment validation
    const paymentValidation = validatePaymentData(req.body, order.totalPrice);
    if (!paymentValidation.isValid) {
      await db.disconnect();
      return res.status(400).json({
        message: "Payment validation failed",
        errors: paymentValidation.errors
      });
    }

    // [PARAMETER TAMPERING FIX] - Check for duplicate payment transactions
    const existingPayment = await Order.findOne({
      'paymentResult.id': paymentValidation.data.id,
      _id: { $ne: order._id }
    });

    if (existingPayment) {
      await db.disconnect();
      auditLogger.logSecurityViolation('duplicate_payment_attempt', {
        userId: user._id,
        orderId: order._id,
        paymentId: paymentValidation.data.id,
        existingOrderId: existingPayment._id
      });
      return res.status(400).json({ message: "Payment transaction ID already used" });
    }

    // Process payment with validated data
    order.isPaid = true;
    order.paidAt = new Date();
    order.paymentResult = {
      id: paymentValidation.data.id,
      status: paymentValidation.data.status,
      email_address: paymentValidation.data.email_address,
      amount: order.totalPrice, // Always use order amount, not client-provided
      currency: 'INR',
      payment_method: 'PayPal',
      transaction_time: new Date()
    };
    order.status = 'paid';

    const paidOrder = await order.save();
    await db.disconnect();

    auditLogger.logUserAction('payment_processed', {
      userId: user._id,
      orderId: order._id,
      amount: order.totalPrice,
      paymentId: paymentValidation.data.id
    });

    res.json({
      message: "Payment processed successfully",
      orderId: paidOrder._id,
      totalPaid: order.totalPrice,
      paymentId: paymentValidation.data.id
    });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('payment_processing_error', {
      error: error.message,
      userId: session?.user?._id,
      orderId: req.query.id
    });
    return res.status(500).json({ message: "Unable to process payment. Please try again." });
  }
};

// [PARAMETER TAMPERING FIX] - Payment data validation
function validatePaymentData(paymentData, expectedAmount) {
  const errors = [];
  const data = {};

  // Validate payment transaction ID
  if (!paymentData.id || typeof paymentData.id !== 'string' || paymentData.id.length < 10 || paymentData.id.length > 100) {
    errors.push("Invalid payment transaction ID");
  } else {
    data.id = paymentData.id.trim();
  }

  // Validate payment status
  const allowedStatuses = ['COMPLETED', 'APPROVED', 'CAPTURED'];
  if (!paymentData.status || !allowedStatuses.includes(paymentData.status)) {
    errors.push("Invalid payment status");
  } else {
    data.status = paymentData.status;
  }

  // Validate email address
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!paymentData.email_address || !emailRegex.test(paymentData.email_address)) {
    errors.push("Invalid email address");
  } else {
    data.email_address = paymentData.email_address.toLowerCase().trim();
  }

  // Critical: Validate payment amount matches order total
  if (paymentData.amount !== undefined) {
    const paidAmount = parseFloat(paymentData.amount);
    if (isNaN(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
      errors.push(`Payment amount mismatch. Expected: ${expectedAmount}, Received: ${paidAmount}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data
  };
}

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;