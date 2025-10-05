// pages/api/admin/users/[id].js
import User from "@/models/User";
import Order from "@/models/Order";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  // [BROKEN ACCESS CONTROL FIX] - Enhanced authentication
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // [PARAMETER TAMPERING FIX] - Validate user ID format
  if (!req.query.id || !isValidObjectId(req.query.id)) {
    return res.status(400).json({ message: "Invalid user ID format" });
  }

  try {
    await db.connect();

    // [BROKEN ACCESS CONTROL FIX] - Verify admin from database
    const requestingAdmin = await User.findById(session.user._id);
    if (!requestingAdmin || !requestingAdmin.isAdmin) {
      await db.disconnect();
      auditLogger.logUnauthorizedAccess('admin_user_access', {
        userId: session.user._id,
        targetUserId: req.query.id,
        method: req.method
      });
      return res.status(403).json({ message: "Admin privileges required" });
    }

    if (req.method === "DELETE") {
      return deleteHandler(req, res, requestingAdmin);
    } else if (req.method === "PUT") {
      return updateHandler(req, res, requestingAdmin);
    } else if (req.method === "GET") {
      return getHandler(req, res, requestingAdmin);
    } else {
      await db.disconnect();
      return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('user_api_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getHandler = async (req, res, requestingAdmin) => {
  try {
    const user = await User.findOne({
      _id: req.query.id,
      isDeleted: { $ne: true }
    }).select('-password');

    if (!user) {
      await db.disconnect();
      return res.status(404).json({ message: "User not found" });
    }

    await db.disconnect();
    res.json(user);
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('user_get_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteHandler = async (req, res, requestingAdmin) => {
  try {
    // [PARAMETER TAMPERING FIX] - Validate target user exists
    const targetUser = await User.findById(req.query.id);
    if (!targetUser || targetUser.isDeleted) {
      await db.disconnect();
      return res.status(404).json({ message: "User not found" });
    }

    // [BROKEN ACCESS CONTROL FIX] - Role hierarchy protection
    if (targetUser.isAdmin) {
      // Only super admins can delete admin users
      if (!requestingAdmin.isSuperAdmin) {
        await db.disconnect();
        auditLogger.logUnauthorizedAccess('admin_delete_attempt', {
          requestingAdminId: requestingAdmin._id,
          targetAdminId: targetUser._id
        });
        return res.status(403).json({
          message: "Super admin privileges required to delete admin users"
        });
      }

      // [PARAMETER TAMPERING FIX] - Prevent self-deletion
      if (targetUser._id.toString() === requestingAdmin._id.toString()) {
        await db.disconnect();
        return res.status(400).json({
          message: "Cannot delete your own admin account"
        });
      }

      // [BROKEN ACCESS CONTROL FIX] - Prevent deletion of last super admin
      if (targetUser.isSuperAdmin) {
        const superAdminCount = await User.countDocuments({
          isSuperAdmin: true,
          isDeleted: { $ne: true }
        });
        if (superAdminCount <= 1) {
          await db.disconnect();
          return res.status(400).json({
            message: "Cannot delete the last super admin account"
          });
        }
      }
    }

    // [PARAMETER TAMPERING FIX] - Business logic validation
    const activeOrders = await Order.countDocuments({
      user: req.query.id,
      isPaid: true,
      isDelivered: false
    });

    if (activeOrders > 0) {
      await db.disconnect();
      return res.status(400).json({
        message: `Cannot delete user with ${activeOrders} active orders. Complete orders first.`
      });
    }

    auditLogger.logAdminAction('user_delete', {
      requestingAdminId: requestingAdmin._id,
      deletedUserId: targetUser._id,
      deletedUserEmail: targetUser.email
    });

    // Soft delete with audit trail
    targetUser.isDeleted = true;
    targetUser.deletedAt = new Date();
    targetUser.deletedBy = requestingAdmin._id;
    targetUser.email = `deleted_${Date.now()}_${targetUser.email}`;

    await targetUser.save();
    await db.disconnect();

    return res.json({
      message: "User deleted successfully",
      deletedUserId: targetUser._id
    });
  } catch (error) {
    await db.disconnect();
    auditLogger.logError('user_deletion_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateHandler = async (req, res, requestingAdmin) => {
  try {
    const targetUser = await User.findById(req.query.id);
    if (!targetUser || targetUser.isDeleted) {
      await db.disconnect();
      return res.status(404).json({ message: "User not found" });
    }

    // [PARAMETER TAMPERING FIX] - Validate update permissions
    const { isAdmin, isSuperAdmin, name, email } = req.body;

    // Only super admins can modify admin privileges
    if ((isAdmin !== undefined || isSuperAdmin !== undefined) && !requestingAdmin.isSuperAdmin) {
      await db.disconnect();
      return res.status(403).json({
        message: "Super admin privileges required to modify admin status"
      });
    }

    // Cannot demote yourself
    if (targetUser._id.toString() === requestingAdmin._id.toString()) {
      if (isAdmin === false || isSuperAdmin === false) {
        await db.disconnect();
        return res.status(400).json({
          message: "Cannot modify your own admin privileges"
        });
      }
    }

    // Prevent removing last super admin
    if (targetUser.isSuperAdmin && isSuperAdmin === false) {
      const superAdminCount = await User.countDocuments({ isSuperAdmin: true, isDeleted: { $ne: true } });
      if (superAdminCount <= 1) {
        await db.disconnect();
        return res.status(400).json({
          message: "Cannot remove super admin status from the last super admin"
        });
      }
    }

    // [PARAMETER TAMPERING FIX] - Validate other updates
    if (name !== undefined) {
      if (typeof name === 'string' && name.trim().length >= 1 && name.length <= 100) {
        targetUser.name = name.trim();
      } else {
        await db.disconnect();
        return res.status(400).json({ message: "Name must be 1-100 characters" });
      }
    }

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email === 'string' && emailRegex.test(email)) {
        // Check if email is already taken
        const existingUser = await User.findOne({
          email: email.toLowerCase().trim(),
          _id: { $ne: targetUser._id }
        });

        if (existingUser) {
          await db.disconnect();
          return res.status(400).json({ message: "Email already in use" });
        }
        targetUser.email = email.toLowerCase().trim();
      } else {
        await db.disconnect();
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    // Apply admin status changes if allowed
    if (isAdmin !== undefined) targetUser.isAdmin = isAdmin;
    if (isSuperAdmin !== undefined) targetUser.isSuperAdmin = isSuperAdmin;

    targetUser.lastModifiedBy = requestingAdmin._id;
    targetUser.lastModifiedAt = new Date();

    await targetUser.save();
    await db.disconnect();

    auditLogger.logAdminAction('user_update', {
      requestingAdminId: requestingAdmin._id,
      updatedUserId: targetUser._id,
      changes: Object.keys(req.body)
    });

    return res.json({
      message: "User updated successfully",
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isAdmin: targetUser.isAdmin,
        isSuperAdmin: targetUser.isSuperAdmin
      }
    });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('user_update_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export default handler;