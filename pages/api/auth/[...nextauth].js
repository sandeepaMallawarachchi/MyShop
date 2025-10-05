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
    //  Runs when JWT is created/updated
    async jwt({ token, user, account, profile }) {
      // Credentials login → attach data
      if (user?._id) {
        token._id = user._id;
        token.isAdmin = user.isAdmin;
      }

      // Google or GitHub login
      if (account?.provider === "google" || account?.provider === "github") {
        await db.connect();

        let email = profile?.email;

        //  GitHub: handle missing email
        if (!email && account.provider === "github") {
          // Fallback → reject login if email missing
          await db.disconnect();
          throw new Error(
              "GitHub account does not have a public email. Please make it public in GitHub settings."
          );
        }

        let existingUser = await User.findOne({ email });

        if (!existingUser) {
          //  Create user if not exists
          existingUser = await User.create({
            name: profile.name || profile.login, // GitHub fallback
            email,
            password: null, // no password for OAuth users
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

    //  Add user data into session
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

        // Validate input first
        if (
            typeof credentials.email !== "string" ||
            !/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/i.test(credentials.email)
        ) {
          await db.disconnect();
          throw new Error("Invalid email format");
        }

        if (
            typeof credentials.password !== "string" ||
            credentials.password.length < 6
        ) {
          await db.disconnect();
          throw new Error("Invalid password");
        }

        // Look up user
        const user = await User.findOne({ email: credentials.email }).lean();
        await db.disconnect();

        if (!user) {
          throw new Error("Invalid email or password");
        }

        // If user has no password (OAuth-only account)
        if (!user.password) {
          throw new Error(
              "This account is registered via Google/GitHub. Please log in with that provider."
          );
        }

        // Compare password
        const isValid = await bcryptjs.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        // Return safe user object
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
        };
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // GitHub OAuth
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
});
