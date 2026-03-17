import * as dotenv from 'dotenv'
dotenv.config()

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function sanitize(html: string): string {
  return html
    .replace(/background-color:[^;"']+;?/gi, '')
    .replace(/color:[^;"']+;?/gi, '')
    .replace(/text-align:[^;"']+;?/gi, '')
    .replace(/style="(\s*;?\s*)*"/gi, '')
}

async function main() {
  // ── NÉGOCIATIONS (NegoCommentaire) ────────────────────────
  const negComments = await (prisma as any).negoCommentaire.findMany()
  console.log(`\n📋 ${negComments.length} commentaires négociation trouvés`)

  for (const c of negComments) {
    const field = c.contenu ?? c.content ?? ''
    const cleaned = sanitize(field)
    if (cleaned !== field) {
      console.log(`\n[PREVIEW] NegoCommentaire ${c.id} :`)
      console.log('AVANT :', field.substring(0, 120))
      console.log('APRÈS :', cleaned.substring(0, 120))
      // ← Décommenter pour appliquer :
      // await (prisma as any).negoCommentaire.update({ where: { id: c.id }, data: { contenu: cleaned } })
    } else {
      console.log(`✅ NegoCommentaire ${c.id} déjà propre`)
    }
  }

  // ── COLLABORATIONS (CollaborationComment) ─────────────────
  const collabComments = await (prisma as any).collaborationComment.findMany()
  console.log(`\n📋 ${collabComments.length} commentaires collaboration trouvés`)

  for (const c of collabComments) {
    const field = c.contenu ?? c.content ?? ''
    const cleaned = sanitize(field)
    if (cleaned !== field) {
      console.log(`\n[PREVIEW] CollaborationComment ${c.id} :`)
      console.log('AVANT :', field.substring(0, 120))
      console.log('APRÈS :', cleaned.substring(0, 120))
      // ← Décommenter pour appliquer :
      // await (prisma as any).collaborationComment.update({ where: { id: c.id }, data: { contenu: cleaned } })
    } else {
      console.log(`✅ CollaborationComment ${c.id} déjà propre`)
    }
  }

  console.log('\n✅ Preview terminé — vérifie les logs puis décommente les update() pour appliquer')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
