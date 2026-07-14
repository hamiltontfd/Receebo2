import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useGuestMode } from "@/components/GuestProvider";

export default function Landing() {
  const { enterGuestMode } = useGuestMode();
  const [, setLocation] = useLocation();

  const startScanning = () => {
    enterGuestMode();
    setLocation("/scan");
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between z-10 sticky top-0 bg-background/90 backdrop-blur border-b">
        <span className="font-extrabold text-xl tracking-tight">Receiptr</span>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="rounded-full">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center">
        <section className="px-6 py-20 max-w-3xl mx-auto w-full flex flex-col gap-8">
          <div className="space-y-6">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05]">
              Receipts.
              <br />
              Easy to find.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-md leading-relaxed">
              Turn every receipt into searchable purchases instantly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <Button
              size="lg"
              className="rounded-full h-14 px-8 text-base font-semibold"
              onClick={startScanning}
            >
              Scan my first receipt
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
          <p className="text-sm text-muted-foreground">
            No account needed to try. Your receipts stay private.
          </p>
        </section>
      </main>

      <footer className="py-8 px-6 text-sm text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} Receiptr. All rights reserved.</p>
      </footer>
    </div>
  );
}
