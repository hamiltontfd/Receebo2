import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGuestMode } from "@/components/GuestProvider";

export default function Landing() {
  const { enterGuestMode } = useGuestMode();
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground selection:bg-primary/20">
      <header className="px-6 py-4 flex items-center justify-between z-10 sticky top-0 bg-background/80 backdrop-blur-md border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono">
            R
          </div>
          <span className="font-bold text-lg tracking-tight">Receiptr</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="text-sm font-medium">
            <Button size="sm" className="rounded-full">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto w-full flex flex-col items-center text-center gap-8">
          <div className="space-y-4 max-w-3xl">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance leading-tight">
              A calm home for every <span className="text-primary">receipt</span>.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Drop your receipts, invoices, and proofs of purchase into Receiptr.
              We'll extract the details, organize them, and make everything searchable in seconds.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <Link href="/sign-up">
              <Button size="lg" className="rounded-full h-14 px-8 text-base font-medium shadow-sm">
                Start Organizing Free
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full h-14 px-8 text-base font-medium"
              onClick={enterGuestMode}
            >
              Try Without Account
            </Button>
          </div>
        </section>
      </main>
      
      <footer className="py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} Receiptr. All rights reserved.</p>
      </footer>
    </div>
  );
}