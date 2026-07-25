import { Link, useLocation } from "wouter";
import { Camera, Search, ShieldCheck, Zap, FileText, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuestMode } from "@/components/GuestProvider";
import { useAuth } from "@clerk/react";
import { useCreateCheckout } from "@/hooks/useBilling";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Snap or upload",
    body: "Take a photo of any receipt or upload a JPEG, PNG, or PDF from your phone or desktop.",
    icon: ScanLine,
  },
  {
    step: "02",
    title: "AI reads it",
    body: "Our AI extracts the merchant, date, total, items, and even warranty info in seconds.",
    icon: Zap,
  },
  {
    step: "03",
    title: "Search anything",
    body: "Ask in plain English — \"coffee last month\" or \"MacBook receipt\" — and get instant results.",
    icon: Search,
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: "Everything in one place",
    body: "Paper receipts, email attachments, PDFs. They all land in the same searchable library.",
  },
  {
    icon: Search,
    title: "Natural-language search",
    body: "No folders, no tags. Just type what you remember and find the receipt in seconds.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your receipts are yours alone. We never share or sell your purchase data.",
  },
  {
    icon: Camera,
    title: "Works anywhere",
    body: "Camera-first on mobile, upload-first on desktop. Use it however feels natural.",
  },
];

const SAMPLE_RECEIPTS = [
  { merchant: "Apple Store", category: "Electronics", amount: "$1,299.00", date: "Jul 12" },
  { merchant: "Whole Foods", category: "Groceries", amount: "$68.42", date: "Jul 10" },
  { merchant: "Nike", category: "Apparel", amount: "$124.95", date: "Jul 7" },
  { merchant: "Delta Airlines", category: "Travel", amount: "$389.00", date: "Jun 30" },
  { merchant: "IKEA", category: "Home", amount: "$214.50", date: "Jun 28" },
];

export default function Landing() {
  const { enterGuestMode } = useGuestMode();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const checkout = useCreateCheckout();

  const startScanning = async () => {
    await enterGuestMode();
    setLocation("/scan");
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-between z-20 sticky top-0 bg-background/90 backdrop-blur border-b">
        <img src="/logo.svg" alt="Receebo" className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Sign In
          </Link>
          <Button size="sm" className="rounded-full" onClick={startScanning}>
            Try free
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div className="flex flex-col gap-7">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]">
                Receipts.<br />Easy to find.
              </h1>
              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                Snap or upload receipts. Search for items you bought. Find them in seconds.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  size="lg"
                  className="rounded-full h-14 px-8 text-base font-semibold"
                  onClick={startScanning}
                >
                  Scan your first receipt
                </Button>
                <Link href="/sign-up" className="sm:inline-flex">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full h-14 px-8 text-base font-medium w-full"
                  >
                    Create an account
                  </Button>
                </Link>
              </div>

            </div>

            {/* Receipt stack visual */}
            <div className="relative flex items-center justify-center h-[420px] md:h-auto">
              {/* Background card */}
              <div className="absolute top-6 right-4 md:right-10 w-[260px] rounded-2xl border bg-background shadow-sm rotate-3 overflow-hidden">
                <div className="h-2 bg-foreground" />
                <div className="p-5 space-y-3">
                  <div className="h-2.5 bg-muted rounded w-24" />
                  <div className="h-2 bg-muted rounded w-32" />
                  <div className="border-t pt-3 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between">
                        <div className="h-2 bg-muted rounded w-28" />
                        <div className="h-2 bg-muted rounded w-10" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Foreground card — the library list */}
              <div className="relative w-[280px] md:w-[300px] rounded-2xl border bg-background shadow-lg overflow-hidden -rotate-1">
                <div className="border-b px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold text-sm">Library</span>
                  <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <ul className="divide-y">
                  {SAMPLE_RECEIPTS.map((r) => (
                    <li key={r.merchant} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{r.merchant}</p>
                        <p className="text-xs text-muted-foreground">{r.category} · {r.date}</p>
                      </div>
                      <span className="font-mono text-sm font-medium shrink-0">{r.amount}</span>
                    </li>
                  ))}
                </ul>
                {/* Search bar at bottom */}
                <div className="border-t px-4 py-3">
                  <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">coffee last month...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">How it works</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                From crumpled paper<br />to searchable record in seconds.
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map(({ step, title, body, icon: Icon }) => (
                <div key={step} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground tracking-widest">{step}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="border-b bg-secondary/40">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Features</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Built for the receipt<br />you always lose.
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-background rounded-2xl border p-6 flex flex-col gap-4">
                  <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold mb-1.5">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-b">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Pricing</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Simple, honest pricing.</h2>
              <p className="text-muted-foreground mt-3 max-w-sm mx-auto text-sm">Start free, upgrade when you need unlimited uploads.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {/* Free */}
              <div className="bg-background rounded-2xl border p-6 flex flex-col gap-4">
                <div>
                  <p className="font-bold text-lg">Free</p>
                  <p className="text-3xl font-extrabold mt-1">€0</p>
                  <p className="text-xs text-muted-foreground mt-1">forever</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                  <li>5 uploads per day</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                </ul>
                {isSignedIn ? (
                  <Link href="/scan">
                    <Button variant="outline" size="sm" className="rounded-full w-full">Get started</Button>
                  </Link>
                ) : (
                  <Link href="/sign-up">
                    <Button variant="outline" size="sm" className="rounded-full w-full">Get started</Button>
                  </Link>
                )}
              </div>
              {/* Monthly */}
              <div className="bg-foreground text-background rounded-2xl border border-foreground p-6 flex flex-col gap-4">
                <div>
                  <p className="font-bold text-lg">Pro Monthly</p>
                  <p className="text-3xl font-extrabold mt-1">€2.99</p>
                  <p className="text-xs opacity-60 mt-1">per month</p>
                </div>
                <ul className="space-y-2 text-sm opacity-80 flex-1">
                  <li>Unlimited uploads</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                  <li>7-day free trial</li>
                </ul>
                {isSignedIn ? (
                  <Button
                    size="sm"
                    className="rounded-full w-full bg-background text-foreground hover:bg-background/90"
                    onClick={() => checkout.mutate("monthly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Start free trial"}
                  </Button>
                ) : (
                  <Link href="/sign-up">
                    <Button size="sm" className="rounded-full w-full bg-background text-foreground hover:bg-background/90">Start free trial</Button>
                  </Link>
                )}
              </div>
              {/* Yearly */}
              <div className="bg-background rounded-2xl border p-6 flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg">Pro Yearly</p>
                    <span className="text-xs bg-secondary rounded-full px-2 py-0.5 font-semibold">Save 30%</span>
                  </div>
                  <p className="text-3xl font-extrabold mt-1">€24.99</p>
                  <p className="text-xs text-muted-foreground mt-1">per year</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                  <li>Unlimited uploads</li>
                  <li>AI extraction</li>
                  <li>Natural-language search</li>
                  <li>Warranty reminders</li>
                  <li>7-day free trial</li>
                </ul>
                {isSignedIn ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full w-full"
                    onClick={() => checkout.mutate("yearly")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Start free trial"}
                  </Button>
                ) : (
                  <Link href="/sign-up">
                    <Button variant="outline" size="sm" className="rounded-full w-full">Start free trial</Button>
                  </Link>
                )}
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8">
              7-day free trial. We'll remind you before your trial ends. Cancel anytime with one click.
            </p>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="border-b">
          <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center gap-8 md:gap-16">
            {[
              { stat: "< 10s", label: "Average extraction time" },
              { stat: "JPG · PNG · PDF", label: "Accepted formats" },
              { stat: "100%", label: "Private — your data stays yours" },
            ].map(({ stat, label }) => (
              <div key={label} className="text-center md:text-left flex-1">
                <p className="text-3xl font-extrabold tracking-tight">{stat}</p>
                <p className="text-sm text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section>
          <div className="max-w-3xl mx-auto px-6 py-24 text-center flex flex-col items-center gap-7">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Stop losing receipts.<br />Start in 30 seconds.
            </h2>
            <p className="text-lg text-muted-foreground max-w-sm">
              No account required. Try it right now with any receipt you have nearby.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <Button
                size="lg"
                className="rounded-full h-14 px-10 text-base font-semibold"
                onClick={startScanning}
              >
                Scan a receipt now
              </Button>
              <Link href="/sign-up" className="sm:inline-flex">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full h-14 px-10 text-base font-medium w-full"
                >
                  Create free account
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <img src="/logo.svg" alt="Receebo" className="h-7 w-auto" />
        <p>&copy; {new Date().getFullYear()} Receebo. All rights reserved.</p>
        <div className="flex gap-5">
          <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign In</Link>
          <Link href="/sign-up" className="hover:text-foreground transition-colors">Sign Up</Link>
        </div>
      </footer>
    </div>
  );
}
