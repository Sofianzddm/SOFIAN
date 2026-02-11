import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, sessionId, type, metadata } = body;

    if (!slug || !sessionId || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Récupérer la marque
    const brand = await prisma.brand.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!brand) {
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );
    }

    // Récupérer le contact HubSpot depuis les query params
    const url = new URL(request.url);
    const hubspotContactId = url.searchParams.get('cid');

    // Headers pour analytics
    const userAgent = request.headers.get('user-agent');
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip');

    if (type === 'view') {
      // Compter le nombre de visites existantes pour ce contact
      const existingViews = await prisma.pageView.findMany({
        where: {
          brandId: brand.id,
          hubspotContactId: hubspotContactId || undefined,
        },
        select: { id: true },
      });

      // Créer une nouvelle page view
      await prisma.pageView.create({
        data: {
          brandId: brand.id,
          sessionId,
          hubspotContactId: hubspotContactId || null,
          visitNumber: existingViews.length + 1,
          userAgent: userAgent || null,
          ipAddress: ipAddress || null,
        },
      });
    } else if (type === 'session_end') {
      // Mettre à jour la dernière page view avec les metrics
      const pageView = await prisma.pageView.findFirst({
        where: {
          brandId: brand.id,
          sessionId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (pageView) {
        await prisma.pageView.update({
          where: { id: pageView.id },
          data: {
            durationSeconds: metadata.durationSeconds || 0,
            scrollDepthPercent: metadata.scrollDepthPercent || 0,
            talentsViewed: metadata.talentsViewed || [],
          },
        });
      }
    } else if (type === 'cta_click') {
      // Marquer le CTA comme cliqué
      const pageView = await prisma.pageView.findFirst({
        where: {
          brandId: brand.id,
          sessionId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (pageView) {
        await prisma.pageView.update({
          where: { id: pageView.id },
          data: {
            ctaClicked: true,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error tracking event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
