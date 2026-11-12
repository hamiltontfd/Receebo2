/**
 * DRAFT pending legal review.
 * Normally development-only. The privacy policy explicitly keeps its pending
 * Hamilton review notice visible in every build. Remove after legal sign-off.
 */
export function LegalDraftNotice({ forHamilton = false }: { forHamilton?: boolean } = {}) {
  if (!import.meta.env.DEV && !forHamilton) return null;
  return (
    <p data-testid="legal-draft-notice" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {forHamilton ? "DRAFT — pending legal review by Hamilton." : "DRAFT — pending legal review. This notice is shown only in development."}
    </p>
  );
}
