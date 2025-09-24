import bcryptjs from "bcryptjs";
import User from "@/models/User";
import db from "@/utils/db";
import { getSession } from "next-auth/react";

const handler = async (req, res) => {
  if (req.method !== "PUT") {
    return res.status(400).send({ message: `${req.method} not supported` });
  }

  const session = await getSession({ req });
  if (!session) {
    return res.status(401).send("Signin required");
  }

  const { user } = session;
  const { name, email, password } = req.body;

  await db.connect();
  const toUpdateUser = await User.findById(user._id);

  if (!toUpdateUser) {
    await db.disconnect();
    return res.status(404).send({ message: "User not found" });
  }

  //  Only update provided fields
  if (name) toUpdateUser.name = name;
  if (email) toUpdateUser.email = email;
  if (password && password.trim().length >= 8) {
    toUpdateUser.password = bcryptjs.hashSync(password, 12); 
  }

  await toUpdateUser.save();
  await db.disconnect();

  res.send({ message: "User updated" });
};

export default handler;
