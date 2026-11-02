import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export function publicPagesPlugin(root, base, origin) {
  return {
    name: "receebo-public-pages",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const shell = bundle["index.html"];
      if (!shell || shell.type !== "asset") throw new Error("Missing built HTML shell");
      const server = await createServer({
        configFile: false, root, base,
        plugins: [react()],
        resolve: { alias: { "@": path.join(root, "src") }, dedupe: ["react", "react-dom"] },
        server: { middlewareMode: true, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
        appType: "custom",
      });
      try {
        const { render, pageMetadata, publicPages } = await server.ssrLoadModule("/src/entry-public.tsx");
        const template = String(shell.source);
        const document = (route, hydrate = true) => {
          const meta = pageMetadata(route, origin);
          let html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`);
          for (const [attribute, key, value] of [
            ["name", "description", meta.description], ["name", "robots", meta.robots],
            ["property", "og:title", meta.title], ["property", "og:description", meta.description],
            ["property", "og:url", meta.canonical],
            ["name", "twitter:title", meta.title], ["name", "twitter:description", meta.description],
          ]) {
            const pattern = new RegExp(`<meta ${attribute}="${key}" content="[^"]*"\\s*/?>`);
            html = html.replace(pattern, value ? `<meta ${attribute}="${key}" content="${escape(value)}" />` : "");
          }
          html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/,
            meta.canonical ? `<link rel="canonical" href="${escape(meta.canonical)}" />` : "");
          if (route === "/404") html = html.replace("<title>Receebo</title>", "<title>Page not found — Receebo</title>");
          return html.replace('<div id="root"></div>',
            `<div id="root"${hydrate ? ` data-public-path="${route}"` : ""}>${hydrate ? render(route) : ""}</div>`);
        };
        // Keep a separate, non-indexable shell for valid client-only routes.
        this.emitFile({ type: "asset", fileName: "app.html", source: document("/app", false) });
        shell.source = document("/");
        for (const route of ["/privacy", "/terms"]) {
          this.emitFile({ type: "asset", fileName: `${route.slice(1)}/index.html`, source: document(route) });
        }
        this.emitFile({ type: "asset", fileName: "404.html", source: document("/404") });
        this.emitFile({
          type: "asset", fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(publicPages).map(route => `  <url><loc>${escape(new URL(route, origin).href)}</loc></url>`).join("\n")}\n</urlset>\n`,
        });
        this.emitFile({
          type: "asset", fileName: "robots.txt",
          source: `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", origin).href}\n`,
        });
      } finally {
        await server.close();
      }
    },
  };
}
