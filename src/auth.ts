import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { createTransport } from "nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { isProvisionedEmail } from "@/server/auth/provisioning";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
      // Gate VOR dem Versand: unbekannte/unprovisionierte Adressen erhalten
      // keinen Magic-Link (kein Account wird angelegt).
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!(await isProvisionedEmail(identifier))) return;
        const transport = createTransport(provider.server as string);
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: "Dein Anmelde-Link für Baudoku",
          text: `Anmelden: ${url}`,
          html: `<p>Klicke zum Anmelden:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    }),
  ],
  callbacks: {
    // Defense-in-depth: selbst wenn ein Token kursiert, wird die Anmeldung
    // einer nicht provisionierten Adresse abgelehnt.
    async signIn({ user }) {
      if (!user.email) return false;
      return await isProvisionedEmail(user.email);
    },
  },
  pages: { signIn: "/login" },
});
