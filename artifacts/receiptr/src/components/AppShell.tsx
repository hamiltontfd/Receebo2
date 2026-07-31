import { Link, useLocation } from "wouter";
import { Search, Camera, LogOut, UserCircle2 } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useGuestMode } from "@/components/GuestProvider";
import { Button } from "@/components/ui/button";
import TrialBanner from "@/components/TrialBanner";

const tabs = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/scan", label: "Scan", icon: Camera },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isGuest, guestUser, exitGuestMode } = useGuestMode();

  const handleSignOut = () => {
    if (isGuest) {
      exitGuestMode();
      setLocation("/");
    } else {
      signOut({ redirectUrl: "/" });
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Trial banner */}
      {!isGuest && <TrialBanner />}

      {/* Mobile top bar */}
      <header className="md:hidden flex h-14 border-b px-4 items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur">
        <Link href="/search">
          <img src="/logo.svg" alt="Receebo" className="h-7 w-auto" />
        </Link>
        <Link href="/profile">
          <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-foreground shrink-0">
            {isGuest
              ? (guestUser?.name?.[0] ?? "G").toUpperCase()
              : (user?.fullName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "?").toUpperCase()}
          </button>
        </Link>
      </header>

      {/* Desktop top nav */}
      <header className="hidden md:flex h-14 border-b px-6 items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur">
        <Link href="/search">
          <img src="/logo.svg" alt="Receebo" className="h-8 w-auto" />
        </Link>
        <nav className="flex items-center gap-1">
          {tabs.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={location.startsWith(href) ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full"
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
              </Button>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/profile">
            <Button
              variant={location.startsWith("/profile") ? "secondary" : "ghost"}
              size="sm"
              className="rounded-full gap-2 text-muted-foreground"
            >
              <UserCircle2 className="w-4 h-4" />
              <span className="hidden lg:inline truncate max-w-[160px]">
                {isGuest ? guestUser?.name : user?.fullName || user?.primaryEmailAddress?.emailAddress}
              </span>
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>


    </div>
  );
}
