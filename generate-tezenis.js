// Script pour générer le press kit Tezenis rapidement

const brands = [
  {
    hubspotId: "test-tezenis",
    name: "Tezenis",
    domain: "tezenis.com",
    niche: "Beauty", // Utilise "Beauty" car c'est ce qui match avec tes talents
    description: "Marque de lingerie italienne tendance"
  }
];

console.log('📦 Génération du press kit Tezenis...\n');
console.log('Copie cette commande et exécute-la :\n');
console.log('curl -X POST http://localhost:3000/api/presskit/generate-batch \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"batchName":"Test Tezenis","brands":' + JSON.stringify(brands) + '}\'');
console.log('\n\nOu visite directement : http://localhost:3000/book/tezenis après génération\n');
