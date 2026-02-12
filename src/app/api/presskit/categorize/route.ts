/**
 * POST /api/presskit/categorize
 * Catégoriser un batch de marques avec Claude
 * Body: { brands: Array<{ name: string; description: string | null }> }
 * Response: { categories: Record<string, number[]> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { categorizeBrands } from '@/lib/claude';

export async function POST(req: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { brands } = body;

    if (!brands || !Array.isArray(brands) || brands.length === 0) {
      return NextResponse.json(
        { error: 'brands est requis et doit être un tableau non vide' },
        { status: 400 }
      );
    }

    console.log(`🔍 Catégorisation de ${brands.length} marques...`);

    const categories = await categorizeBrands(brands);

    return NextResponse.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error('❌ Erreur API /api/presskit/categorize:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la catégorisation des marques' },
      { status: 500 }
    );
  }
}
