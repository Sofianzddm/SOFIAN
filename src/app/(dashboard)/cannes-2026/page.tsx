import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CannesClient from "./CannesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const [events, contacts, presences] = await Promise.all([
    prisma.cannesEvent.findMany({
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        attendees: {
          include: {
            presence: {
              include: {
                user: { select: { id: true, prenom: true, nom: true, role: true } },
                talent: {
                  select: {
                    id: true,
                    prenom: true,
                    nom: true,
                    photo: true,
                    instagram: true,
                    tiktok: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.cannesContact.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.cannesPresence.findMany({
      orderBy: [{ arrivalDate: "asc" }],
      include: {
        user: { select: { id: true, prenom: true, nom: true, role: true } },
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            instagram: true,
            tiktok: true,
          },
        },
      },
    }),
  ]);

  return (
    <CannesClient
      isAdmin={session.user.role === "ADMIN"}
      initialEvents={JSON.parse(JSON.stringify(events))}
      initialContacts={JSON.parse(JSON.stringify(contacts))}
      initialPresences={JSON.parse(JSON.stringify(presences))}
    />
  );
}
