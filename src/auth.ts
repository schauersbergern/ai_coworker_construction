import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { isEmailAllowed } from "@/server/auth/access";
import { getOrCreateDefaultOrg } from "@/server/auth/default-org";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Verknüpft den Google-Login mit einem evtl. bereits vorhandenen User gleicher
      // E-Mail (z. B. aus altem Seed/Magic-Link), statt mit OAuthAccountNotLinked zu
      // scheitern. Sicher, weil Google die E-Mail verifiziert + ALLOWED_EMAILS gatet.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    // Zugangs-Gate: nur E-Mails aus ALLOWED_EMAILS dürfen sich anmelden.
    // Bei false wird weder Account noch User angelegt.
    async signIn({ user }) {
      return isEmailAllowed(user.email);
    },
  },
  events: {
    // Beim ersten Login (User wird vom Adapter angelegt) der gemeinsamen
    // Pilot-Organisation zuordnen.
    async createUser({ user }) {
      const org = await getOrCreateDefaultOrg();
      await prisma.user.update({ where: { id: user.id }, data: { orgId: org.id } });
    },
  },
  pages: { signIn: "/login" },
});
