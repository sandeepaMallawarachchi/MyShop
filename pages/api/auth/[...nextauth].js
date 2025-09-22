import User from "@/models/User";
import db from "@/utils/db";
import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import bcryptjs from "bcryptjs";

export default NextAuth({
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      //  Credentials login
      if (user?._id) {
        token._id = user._id;
        token.isAdmin = user.isAdmin;
      }

      //  Google or GitHub login
      if (account?.provider === "google" || account?.provider === "github") {
        await db.connect();

        let existingUser = await User.findOne({ email: profile.email });

        if (!existingUser) {
          // GitHub sometimes doesn’t provide email if it’s private → handle that
          const email =
            profile.email ||
            `${profile.id}@github.temp`; // fallback for GitHub private emails

          existingUser = await User.create({
            name: profile.name || profile.login, // GitHub: profile.login = username
            email,
            password: bcryptjs.hashSync(Math.random().toString(36).slice(-8)), // random password placeholder
            isAdmin: false,
          });
        }

        token._id = existingUser._id;
        token.isAdmin = existingUser.isAdmin;
        token.provider = account.provider;

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
    //  Credentials login
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

    //  Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    //  GitHub OAuth
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
});
