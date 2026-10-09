/**
 * Plein écran dans la zone contenu (sidebar + header) : fixed pour ignorer le p-6 du <main>
 * et éviter la double scrollbar avec le viewer PDF.
 */
export default function ContratMarqueReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 top-16 z-20 flex min-h-0 flex-col overflow-y-auto bg-[#fafafa] lg:inset-auto lg:bottom-0 lg:left-64 lg:right-0">
      {children}
    </div>
  );
}
