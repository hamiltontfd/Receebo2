import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { MotionConfig } from "framer-motion";
import { GuestProvider } from "@/components/GuestProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import SearchPage from "@/pages/search";
import Scan from "@/pages/scan";
import ReceiptDetail from "@/pages/receipt-detail";
import Settings from "@/pages/settings";
import { Toaster } from "@/components/ui/toaster";
import "./capture.css";

// Existing product pages, not recreated marketing UI. This entry has no
// production route and is served only by the independent loopback config.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuestProvider><TooltipProvider><MotionConfig reducedMotion="always">
        <div className="bg-violet-50 text-violet-950 text-center text-xs font-semibold py-2">
          Sample data · fictional purchases · simulated extraction
        </div>
        <AppShell><Switch>
          <Route path="/scan" component={Scan} />
          <Route path="/receipts/:id" component={ReceiptDetail} />
          <Route path="/settings" component={Settings} />
          <Route component={SearchPage} />
        </Switch></AppShell>
        <Toaster />
      </MotionConfig></TooltipProvider></GuestProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
