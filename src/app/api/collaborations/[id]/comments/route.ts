import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const params = await Promise.resolve(context.params);
    const { id: collaborationId } = params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Le contenu du commentaire est requis" },
        { status: 400 }
      );
    }

    const collaboration = await prisma.collaboration.findUnique({
      where: { id: collaborationId },
      select: { id: true, reference: true },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    const currentUserId = (session.user as { id: string }).id;

    const comment = await prisma.collaborationComment.create({
      data: {
        collaborationId,
        content: content.trim(),
        userId: currentUserId,
      },
      include: {
        user: { select: { id: true, prenom: true, nom: true } },
      },
    });

    const mentionedIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      const userId = match[1];
      if (userId !== currentUserId) mentionedIds.add(userId);
    }

    if (mentionedIds.size > 0) {
      const actor = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { prenom: true },
      });
      const actorName = actor?.prenom || "Quelqu'un";
      const link = `/collaborations/${collaborationId}`;

      await prisma.$transaction([
        ...Array.from(mentionedIds).map((mentionedUserId) =>
          prisma.collabCommentMention.create({
            data: {
              commentId: comment.id,
              userId: mentionedUserId,
              mentionedBy: currentUserId,
            },
          })
        ),
        ...Array.from(mentionedIds).map((mentionedUserId) =>
          prisma.notification.create({
            data: {
              userId: mentionedUserId,
              type: "MENTION",
              titre: `${actorName} vous a mentionné`,
              message: `sur la collaboration ${collaboration.reference}`,
              lien: link,
              actorId: currentUserId,
            },
          })
        ),
      ]);
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Erreur création commentaire collab:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}
