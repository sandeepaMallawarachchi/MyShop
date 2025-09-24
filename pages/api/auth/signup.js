// pages/api/auth/signup.js
import User from "@/models/User";
import db from "@/utils/db";
import bcryptjs from "bcryptjs";
import { auditLogger } from "@/utils/auditLogger";

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // [PARAMETER TAMPERING FIX] - Explicit parameter extraction (ignore other fields)
    const { name, email, password } = req.body;

    // [PARAMETER TAMPERING FIX] - Comprehensive input validation
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return res.status(400).json({ message: "Name must be 1-100 characters" });
    }

    if (!email || typeof email !== 'string' || !isValidEmail(email) || email.length > 254) {
      return res.status(400).json({ message: "Valid email address is required" });
    }

    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Password must be 8-128 characters" });
    }

    // [PARAMETER TAMPERING FIX] - Password strength validation
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must contain uppercase, lowercase, and number"
      });
    }

    await db.connect();

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      await db.disconnect();
      return res.status(409).json({ message: "User already exists" });
    }

    // [PARAMETER TAMPERING FIX] - Create user with only validated fields
    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: bcryptjs.hashSync(password, 12),
      isAdmin: false, // ALWAYS false - NEVER allow client to set this
      createdAt: new Date()
    });

    const user = await newUser.save();
    await db.disconnect();

    auditLogger.logUserAction('user_registered', {
      userId: user._id,
      email: user.email
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });

  } catch (error) {
    await db.disconnect();
    auditLogger.logError('user_registration_error', { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

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