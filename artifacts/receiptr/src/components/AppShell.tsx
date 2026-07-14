import { Link, useLocation } from "wouter";
import { Search, Camera, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useUser, useClerk } from "@clerk/react";
import { useGuestMode } from "@/components/GuestProvider";
import { Button } from "@/components/ui/button";

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
      {/* Desktop top nav */}
      <header className="hidden md:flex h-14 border-b px-6 items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur">
        <Link href="/search" className="font-extrabold tracking-tight text-lg">
          Receiptr
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground truncate max-w-[180px]">
            {isGuest ? guestUser?.name : user?.fullName || user?.primaryEmailAddress?.emailAddress}
          </span>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 text-xs font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <motion.span
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="flex flex-col items-center justify-center gap-1"
                >
                  {href === "/scan" ? (
                    <motion.span
                      animate={{ scale: active ? 1.05 : 1, backgroundColor: active ? "hsl(var(--foreground))" : "hsl(var(--secondary))" }}
                      transition={{ type: "spring", stiffness: 350, damping: 22 }}
                      className={`flex items-center justify-center w-10 h-10 rounded-xl ${active ? "text-background" : "text-foreground"}`}
                    >
                      <Icon className="w-5 h-5" />
                    </motion.span>
                  ) : (
                    <>
                      <motion.span
                        animate={{ scale: active ? 1.15 : 1 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        className="flex items-center justify-center"
                      >
                        <Icon className="w-5 h-5" />
                      </motion.span>
                      <span>{label}</span>
                    </>
                  )}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
