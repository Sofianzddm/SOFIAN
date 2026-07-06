import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getNextAuthSecret } from "@/lib/nextAuthSecret";

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

        // Email normalisé : on retire les espaces et on compare sans tenir
        // compte de la casse, sinon "manon.j@…" (minuscule) ne retrouve pas
        // un compte enregistré "Manon.j@…" en base.
        const email = credentials.email.trim();

        let user;
        try {
          user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
          });
        } catch (err) {
          // Une panne d'accès base ne doit jamais remonter un message vide
          // (sinon NextAuth affiche littéralement "undefined" côté login).
          console.error("[auth] Erreur lecture utilisateur:", err);
          throw new Error("Service indisponible, réessayez dans un instant");
        }

        if (!user || !user.actif) {
          throw new Error("Compte inexistant ou désactivé");
        }

        // Vérifier que l'utilisateur a un mot de passe défini
        if (!user.password) {
          throw new Error("Mot de passe non défini pour ce compte");
        }

        let isPasswordValid = false;
        try {
          isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );
        } catch (err) {
          console.error("[auth] Erreur vérification mot de passe:", err);
          throw new Error("Mot de passe incorrect");
        }

        if (!isPasswordValid) {
          throw new Error("Mot de passe incorrect");
        }

        // Construit le nom affiché sans laisser passer un "undefined"/"null"
        // littéral lorsque prénom ou nom n'est pas renseigné en base.
        const displayName =
          [user.prenom, user.nom].filter((p) => p && p.trim()).join(" ").trim() ||
          user.email;

        return {
          id: user.id,
          email: user.email,
          name: displayName,
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
    maxAge: 14 * 24 * 60 * 60, // 14 jours
  },
  secret: getNextAuthSecret(),
};
