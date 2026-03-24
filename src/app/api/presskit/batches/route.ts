import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const batches = await prisma.batch.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
      include: {
        brands: {
          select: {
            status: true,
          },
        },
      },
    });

    const payload = batches.map((b) => {
      const statusCounts = b.brands.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      return {
        id: b.id,
        name: b.name,
        status: b.status,
        totalBrands: b.totalBrands,
        completed: b.completed,
        failed: b.failed,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        statusCounts,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching batches:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
