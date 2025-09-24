import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // ensures consistency for Google/GitHub logins
      trim: true,
    },
    password: {
      type: String,
      required: false, // ✅ allow null for OAuth users
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    // 🔐 OTP fields for password reset / verification
    otp: {
      type: String,
      required: false,
    },
    otpExpires: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
