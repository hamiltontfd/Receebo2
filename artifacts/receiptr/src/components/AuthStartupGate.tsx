import { useAuth } from "@clerk/react";
import { BrandLoading } from "@/components/BrandLoading";

/** Keep the initial auth wait visible without mounting the protected gates early. */
export function AuthStartupGate({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  return isLoaded ? <>{children}</> : <BrandLoading />;
}
