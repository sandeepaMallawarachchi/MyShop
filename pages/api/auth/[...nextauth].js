import User from "@/models/User";
import db from "@/utils/db";
import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcryptjs from "bcryptjs";

export default NextAuth({
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // For Credentials login
      if (user?._id) {
        token._id = user._id;
        token.isAdmin = user.isAdmin;
      }

      // For Google login
      if (account?.provider === "google") {
        await db.connect();
        let existingUser = await User.findOne({ email: profile.email });

        if (!existingUser) {
          // create new user in DB
          existingUser = await User.create({
            name: profile.name,
            email: profile.email,
            password: bcryptjs.hashSync(Math.random().toString(36).slice(-8)), // random password
            isAdmin: false,
          });
        }

        token._id = existingUser._id;
        token.isAdmin = existingUser.isAdmin;
        token.provider = "google";
        await db.disconnect();
      }

      return token;
    },
    async session({ session, token }) {
      if (token?._id) session.user._id = token._id;
      if (token?.isAdmin) session.user.isAdmin = token.isAdmin;
      if (token?.provider) session.user.provider = token.provider;
      return session;
    },
  },
  providers: [
    // Credentials login
    CredentialsProvider({
      async authorize(credentials) {
        await db.connect();
        const user = await User.findOne({ email: credentials.email });
        await db.disconnect();

        if (user && bcryptjs.compareSync(credentials.password, user.password)) {
          return {
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
          };
        }
        throw new Error("Invalid email or password");
      },
    }),

    // Google OAuth login
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
});
