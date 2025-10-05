import bcryptjs from "bcryptjs";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== "PUT") {
    return res.status(400).send({ message: `${req.method} not supported` });
  }

  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
      return res.status(400).json({ message: "Valid name is required" });
    }

    if (!email || typeof email !== "string" || !isValidEmail(email) || email.length > 254) {
      return res.status(400).json({ message: "Valid email address is required" });
    }

    if (password && (typeof password !== "string" || password.length < 8 || password.length > 128)) {
      return res.status(400).json({ message: "Password must be 8–128 characters" });
    }

    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must contain uppercase, lowercase, and number",
      });
    }

    await db.connect();

    const toUpdateUser = await User.findById(session.user._id);
    if (!toUpdateUser) {
      await db.disconnect();
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent duplicate email
    if (email !== session.user.email) {
      const existingUser = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: session.user._id },
      });
      if (existingUser) {
        await db.disconnect();
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    // Update allowed fields only
    toUpdateUser.name = name.trim();
    toUpdateUser.email = email.toLowerCase().trim();
    if (password) {
      toUpdateUser.password = bcryptjs.hashSync(password.trim(), 12);
    }

    await toUpdateUser.save();
    await db.disconnect();

    auditLogger.logUserAction("profile_updated", {
      userId: toUpdateUser._id,
      emailChanged: email !== session.user.email,
      passwordChanged: !!password,
    });

    res.send({ message: "User updated successfully" });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError("profile_update_error", { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Helpers
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isStrongPassword(password) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasUpper && hasLower && hasNumber;
}

export default handler;