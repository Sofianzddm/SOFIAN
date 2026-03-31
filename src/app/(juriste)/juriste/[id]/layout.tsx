/**
 * Plein écran sous le header juriste (h-14) : fixed pour éviter la double scrollbar.
 */
export default function JuristeContratLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 top-14 z-20 flex min-h-0 flex-col overflow-hidden bg-[#fafafa]">
      {children}
    </div>
  );
}
