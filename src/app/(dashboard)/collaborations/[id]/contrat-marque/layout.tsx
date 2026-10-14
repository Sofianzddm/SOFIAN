/**
 * Plein écran dans la zone contenu (sidebar + header) : fixed pour ignorer le p-6 du <main>
 * et éviter la double scrollbar avec le viewer PDF.
 * Important : top + bottom bornés (sinon hauteur indéfinie → canvas PDF.js non peint).
 */
export default function ContratMarqueReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-20 flex min-h-0 flex-col overflow-hidden bg-[#fafafa] lg:left-64">
      {children}
    </div>
  );
}
