import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ChartNoAxesColumn, LogOut, Plus, Search, UserCircle2 } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useGuestMode } from "@/components/GuestProvider";
import { Button } from "@/components/ui/button";
import TrialBanner from "@/components/TrialBanner";
import { BottomTabBar } from "@/components/BottomTabBar";
import { usePendingImportCount } from "@/components/PendingImports";
import { getLastTab, hidesTabBar, rememberTab, subPageFor } from "@/lib/navState";

// Desktop header tabs (nav B): Search · Add · Stats. Add opens today's /scan page.
const tabs = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/scan", label: "Add", icon: Plus },
  { href: "/stats", label: "Stats", icon: ChartNoAxesColumn },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isGuest, guestUser, exitGuestMode } = useGuestMode();
  const pendingCount = usePendingImportCount();
  const onSearch = location === "/search" || location.startsWith("/search/");
  const pendingDot = !isGuest && pendingCount > 0;
  const subPage = subPageFor(location);
  const showTabBar = !hidesTabBar(location);

  useEffect(() => { rememberTab(location); }, [location]);

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

      {/* Mobile top bar: logo + avatar, or Back + title on the avatar's pages */}
      {subPage ? (
        <header style={{ top: "env(safe-area-inset-top)" }} className="md:hidden grid grid-cols-[1fr_auto_1fr] h-14 px-4 items-center sticky top-0 z-20 bg-background/90 backdrop-blur" data-testid="subpage-header">
          <Link
            href={subPage.back ?? getLastTab()}
            className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground justify-self-start"
            data-testid="link-subpage-back"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </Link>
          <h1 className="text-[17px] font-bold tracking-[-0.01em] truncate">{subPage.title}</h1>
          <span />
        </header>
      ) : (
        <header style={{ top: "env(safe-area-inset-top)" }} className="md:hidden flex h-14 px-4 items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur">
          <Link href="/search">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Receebo" className="h-[2rem] w-auto" />
          </Link>
          <Link href="/profile">
            <button aria-label="Open profile" className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-foreground shrink-0">
              {isGuest
                ? (guestUser?.name?.[0] ?? "G").toUpperCase()
                : (user?.fullName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "?").toUpperCase()}
            </button>
          </Link>
        </header>
      )}

      {/* Desktop top nav */}
      <header className="hidden md:flex h-14 border-b px-6 items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur">
        <Link href="/search">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Receebo" className="h-8 w-auto" />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {tabs.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={location.startsWith(href) ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full"
                data-testid={`desktop-tab-${label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
                {href === "/search" && pendingDot && !onSearch && (
                  <span
                    data-testid="desktop-search-pending-dot"
                    aria-label="Purchases waiting in your email"
                    className="ml-1.5 w-1.5 h-1.5 rounded-full bg-foreground"
                  />
                )}
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

      <main className="flex-1 min-w-0 flex flex-col">{children}</main>

      {showTabBar && <BottomTabBar pendingDot={pendingDot} />}
    </div>
  );
}
