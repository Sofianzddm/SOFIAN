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
    <div className="fixed bottom-0 left-64 right-0 top-16 z-20 flex min-h-0 flex-col overflow-y-auto bg-[#fafafa]">
      {children}
    </div>
  );
}
