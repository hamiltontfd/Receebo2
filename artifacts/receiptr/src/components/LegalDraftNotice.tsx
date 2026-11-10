/**
 * DRAFT pending legal review.
 * Visible only while Vite is in development (including the Replit dev server).
 * Production builds omit it. Remove this component after counsel signs off.
 */
export function LegalDraftNotice() {
  if (!import.meta.env.DEV) return null;
  return (
    <p data-testid="legal-draft-notice" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      DRAFT — pending legal review. This notice is shown only in development.
    </p>
  );
}
