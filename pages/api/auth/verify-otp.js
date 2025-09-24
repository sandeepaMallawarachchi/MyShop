import db from "@/utils/db";
import User from "@/models/User";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  await db.connect();
  const user = await User.findOne({ email });

  if (!user || !user.otp || !user.otpExpires) {
    await db.disconnect();
    return res.status(400).json({ success: false, message: "OTP not found" });
  }

  // Compare OTP and expiry
  if (String(user.otp) !== String(otp) || user.otpExpires < new Date()) {
    await db.disconnect();
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
  }

  // OTP is valid → clear it
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  await db.disconnect();
  return res.status(200).json({ success: true });
}
