import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email et mot de passe requis");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.actif) {
          throw new Error("Compte inexistant ou désactivé");
        }

        // Vérifier que l'utilisateur a un mot de passe défini
        if (!user.password) {
          throw new Error("Mot de passe non défini pour ce compte");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Mot de passe incorrect");
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.prenom} ${user.nom}`,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id;
        (token as any).role = (user as any).role;
      }

      // Permettre la mise à jour du token via useSession().update()
      if (trigger === "update" && (session as any)?.impersonatedId) {
        (token as any).impersonatedId = (session as any).impersonatedId;
        (token as any).impersonatedRole = (session as any).impersonatedRole;
        (token as any).adminName = (session as any).adminName;
      }
      if (trigger === "update" && (session as any)?.stopImpersonation) {
        delete (token as any).impersonatedId;
        delete (token as any).impersonatedRole;
        delete (token as any).adminName;
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      const t = token as any;

      const effectiveId = t.impersonatedId ?? t.sub ?? t.id;
      const effectiveRole = t.impersonatedRole ?? t.role;

      session.user.id = effectiveId as string;
      (session.user as any).role = effectiveRole as string | undefined;

      // Garder une trace de l'admin réel pour le bandeau
      (session.user as any).adminId = t.impersonatedId ? (t.sub ?? t.id) : undefined;
      (session.user as any).adminName = t.impersonatedId ? t.adminName : undefined;

      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
  secret: process.env.NEXTAUTH_SECRET,
};
