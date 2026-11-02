export const publicPages = {
  "/": {
    title: "Receebo — Receipts. Easy to find.",
    description: "Scan or import from Outlook. Find any purchase in seconds. Never miss a return or warranty date.",
  },
  "/privacy": {
    title: "Privacy Policy — Receebo",
    description: "How Receebo collects, uses, stores, and protects personal data.",
  },
  "/terms": {
    title: "Terms of Service — Receebo",
    description: "The terms that apply when using Receebo's receipt-management service.",
  },
} as const;

export function pageMetadata(path: string, origin: string) {
  const page = publicPages[path as keyof typeof publicPages];
  return {
    title: page?.title ?? "Receebo",
    description: page?.description ?? "Manage your receipts with Receebo.",
    robots: page ? "index, follow" : "noindex, follow",
    canonical: page ? new URL(path, origin).href : null,
  };
}

export function applyPageMetadata(path: string) {
  const meta = pageMetadata(path, import.meta.env.VITE_APP_URL);
  document.title = meta.title;
  for (const [selector, value] of [
    ['meta[name="description"]', meta.description],
    ['meta[name="robots"]', meta.robots],
    ['meta[property="og:title"]', meta.title],
    ['meta[property="og:description"]', meta.description],
    ['meta[name="twitter:title"]', meta.title],
    ['meta[name="twitter:description"]', meta.description],
  ]) {
    document.querySelector(selector)?.setAttribute("content", value);
  }
  const canonical = document.querySelector('link[rel="canonical"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (meta.canonical) {
    const link = canonical ?? document.head.appendChild(document.createElement("link"));
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", meta.canonical);
    const tag = ogUrl ?? document.head.appendChild(document.createElement("meta"));
    tag.setAttribute("property", "og:url");
    tag.setAttribute("content", meta.canonical);
  } else {
    canonical?.remove();
    ogUrl?.remove();
  }
}
