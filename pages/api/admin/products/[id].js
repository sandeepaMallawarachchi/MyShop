// pages/api/admin/products/[id].js
import Product from "@/models/Product";
import User from "@/models/User";
import Order from "@/models/Order";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  // [BROKEN ACCESS CONTROL FIX] - Enhanced admin validation
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // [PARAMETER TAMPERING FIX] - Validate product ID format
  if (!req.query.id || !isValidObjectId(req.query.id)) {
    return res.status(400).json({ message: "Invalid product ID format" });
  }

  try {
    await db.connect();

    // [BROKEN ACCESS CONTROL FIX] - Verify admin status from database
    const adminUser = await User.findById(session.user._id);
    if (!adminUser || !adminUser.isAdmin) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('admin_product_access', {
        userId: session.user._id,
        productId: req.query.id,
        method: req.method
      });
      return res.status(403).json({ message: "Admin privileges required" });
    }

    if (req.method === "GET") {
      return getHandler(req, res, adminUser);
    } else if (req.method === "PUT") {
      return putHandler(req, res, adminUser);
    } else if (req.method === "DELETE") {
      return deleteHandler(req, res, adminUser);
    } else {
      await db.disconnect();
      return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('product_api_error', { error: error.message, productId: req.query.id });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getHandler = async (req, res, adminUser) => {
  try {
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
    auditLogger.logError('product_get_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteHandler = async (req, res, adminUser) => {
  try {
    // [PARAMETER TAMPERING FIX] - Validate product exists and not deleted
    const product = await Product.findOne({
      _id: req.query.id,
      isDeleted: { $ne: true }
    });

    if (!product) {
      await db.disconnect();
      return res.status(404).json({ message: "Product not found" });
    }

    // [BROKEN ACCESS CONTROL FIX] - Role-based deletion restrictions
    if (product.isSystemCritical && !adminUser.isSuperAdmin) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('system_critical_product_delete', {
        adminId: adminUser._id,
        productId: product._id
      });
      return res.status(403).json({
        message: "Super admin privileges required to delete system critical products"
      });
    }

    // [PARAMETER TAMPERING FIX] - Business logic validation
    const activeOrders = await Order.countDocuments({
      'orderItems._id': req.query.id,
      isPaid: true,
      isDelivered: false
    });

    if (activeOrders > 0) {
      await db.disconnect();
      return res.status(400).json({
        message: `Cannot delete product. ${activeOrders} active orders depend on this product.`
      });
    }

    auditLogger.logAdminAction('product_delete', {
      adminId: adminUser._id,
      productId: product._id,
      productName: product.name
    });

    // Soft delete with audit trail
    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = adminUser._id;
    await product.save();

    await db.disconnect();
    return res.json({
      message: "Product deleted successfully",
      productId: product._id
    });
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('product_deletion_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const putHandler = async (req, res, adminUser) => {
  try {
    const product = await Product.findOne({
      _id: req.query.id,
      isDeleted: { $ne: true }
    });

    if (!product) {
      await db.disconnect();
      return res.status(404).json({ message: "Product not found" });
    }

    // [BROKEN ACCESS CONTROL FIX] - Role-based update restrictions
    if (product.isSystemCritical && !adminUser.isSuperAdmin) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('system_critical_product_update', {
        adminId: adminUser._id,
        productId: product._id
      });
      return res.status(403).json({
        message: "Super admin privileges required to modify system critical products"
      });
    }

    // [PARAMETER TAMPERING FIX] - Comprehensive input validation
    const validation = validateProductUpdates(req.body);
    if (validation.errors.length > 0) {
      await db.disconnect();
      return res.status(400).json({
        message: "Validation errors",
        errors: validation.errors
      });
    }

    Object.assign(product, validation.data);
    product.lastModifiedBy = adminUser._id;
    product.lastModifiedAt = new Date();

    await product.save();
    await db.disconnect();

    auditLogger.logAdminAction('product_update', {
      adminId: adminUser._id,
      productId: product._id,
      changes: Object.keys(validation.data)
    });

    return res.json({ message: "Product updated successfully" });
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('product_update_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

// [PARAMETER TAMPERING FIX] - Input validation helper
function validateProductUpdates(body) {
  const errors = [];
  const data = {};

  if (body.name !== undefined) {
    if (typeof body.name === 'string' && body.name.trim().length >= 1 && body.name.length <= 200) {
      data.name = body.name.trim();
    } else {
      errors.push("Name must be 1-200 characters");
    }
  }

  if (body.slug !== undefined) {
    if (typeof body.slug === 'string' && /^[a-z0-9-]+$/.test(body.slug) && body.slug.length <= 100) {
      data.slug = body.slug.trim().toLowerCase();
    } else {
      errors.push("Slug must contain only lowercase letters, numbers, and hyphens");
    }
  }

  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (!isNaN(price) && price >= 0 && price <= 999999) {
      data.price = Math.round(price * 100) / 100;
    } else {
      errors.push("Price must be between 0 and 999999");
    }
  }

  if (body.category !== undefined) {
    if (typeof body.category === 'string' && body.category.trim().length >= 1 && body.category.length <= 100) {
      data.category = body.category.trim();
    } else {
      errors.push("Category must be 1-100 characters");
    }
  }

  if (body.brand !== undefined) {
    if (typeof body.brand === 'string' && body.brand.trim().length >= 1 && body.brand.length <= 100) {
      data.brand = body.brand.trim();
    } else {
      errors.push("Brand must be 1-100 characters");
    }
  }

  if (body.countInStock !== undefined) {
    const stock = parseInt(body.countInStock, 10);
    if (!isNaN(stock) && stock >= 0 && stock <= 999999) {
      data.countInStock = stock;
    } else {
      errors.push("Stock count must be between 0 and 999999");
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description === 'string' && body.description.trim().length >= 1 && body.description.length <= 2000) {
      data.description = body.description.trim();
    } else {
      errors.push("Description must be 1-2000 characters");
    }
  }

  if (body.image !== undefined) {
    if (typeof body.image === 'string' && body.image.trim().length > 0) {
      try {
        new URL(body.image);
        data.image = body.image.trim();
      } catch {
        errors.push("Image must be a valid URL");
      }
    } else {
      errors.push("Image URL is required");
    }
  }

  return { data, errors };
}

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;