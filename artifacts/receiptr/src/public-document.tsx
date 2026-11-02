import { Router } from "wouter";
import { LandingContent } from "./pages/landing";
import PrivacyPolicy from "./pages/privacy";
import TermsOfService from "./pages/terms";
import NotFound from "./pages/not-found";

/** Provider-independent snapshot. Never reads a session or contacts an API. */
export default function PublicDocument({ path }: { path: string }) {
  return <Router base={import.meta.env.BASE_URL.replace(/\/$/, "")} ssrPath={path}>
    <div data-public-document>
      {/* Motion's entrance styles must not hide the no-JavaScript document. */}
      <style>{`[data-public-document] [style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
      {path === "/" ? <LandingContent /> : path === "/privacy" ? <PrivacyPolicy /> :
        path === "/terms" ? <TermsOfService /> : <NotFound />}
    </div>
  </Router>;
}
