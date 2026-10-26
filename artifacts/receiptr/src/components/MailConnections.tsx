import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Mail, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  disconnectMailProvider,
  fetchMailStatus,
  getMailConnectionUrl,
  syncMail,
  type MailProviderId,
  type MailProviderStatus,
  type MailStatus,
} from "@/lib/mailConnection";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

export function useMailStatus() {
  return useQuery<MailStatus>({
    queryKey: ["mail", "status"],
    queryFn: () => fetchMailStatus(BASE),
    staleTime: 60_000,
    retry: false,
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProviderCard({
  provider,
  pendingCount,
}: {
  provider: MailProviderStatus;
  pendingCount: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const label = provider.label;
  const retired = !provider.enabled;

  const connect = useMutation({
    mutationFn: () => getMailConnectionUrl(BASE, provider.id),
    onSuccess: (url) => window.location.assign(url),
    onError: () =>
      toast({
        title: `${label} connection failed`,
        description: `Could not start the ${label} connection. Please try again.`,
        variant: "destructive",
      }),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectMailProvider(BASE, provider.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mail"] });
      toast({ title: `${label} disconnected` });
    },
    onError: () =>
      toast({
        title: "Something went wrong",
        description: `Could not disconnect ${label}. Please try again.`,
        variant: "destructive",
      }),
  });

  const sync = useMutation({
    mutationFn: () => syncMail(BASE),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["mail"] });
      if (result.needsReconnect?.length) {
        toast({
          title: "Reconnect needed",
          description: "Your email connection expired. Reconnect to keep importing receipts.",
          variant: "destructive",
        });
      } else if (result.queued > 0) {
        toast({
          title: `Found ${result.queued} new receipt${result.queued > 1 ? "s" : ""}`,
          description: "Check your pending imports.",
        });
      } else {
        toast({ title: "No new receipts found" });
      }
    },
    onError: () =>
      toast({
        title: "Sync failed",
        description: "Could not reach your inbox. Try again shortly.",
        variant: "destructive",
      }),
  });

  const busy = connect.isPending || disconnect.isPending || sync.isPending;

  return (
    <div className="border rounded-xl p-5" data-testid={`mail-provider-${provider.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{label}</p>
            {provider.connected ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {provider.accountEmail ?? "Connected"}
                {!retired && provider.lastSyncedAt && (
                  <> · Last synced {formatDateTime(provider.lastSyncedAt)}</>
                )}
                {!retired && pendingCount > 0 && (
                  <> ·{" "}
                    <span className="font-semibold text-foreground">{pendingCount} pending</span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-import receipts and order emails from your inbox
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {provider.connected ? (
            <>
              {!retired && !provider.needsReconnect && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-8 text-xs text-muted-foreground"
                  onClick={() => sync.mutate()}
                  disabled={busy}
                  aria-label={`Sync ${label}`}
                >
                  {sync.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-8 text-xs"
                onClick={() => disconnect.mutate()}
                disabled={busy}
              >
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="rounded-full h-8 text-xs gap-1.5"
              onClick={() => connect.mutate()}
              disabled={busy}
            >
              <PlugZap className="w-3 h-3" />
              {connect.isPending ? "Connecting…" : `Connect ${label}`}
            </Button>
          )}
        </div>
      </div>

      {!retired && provider.connected && provider.needsReconnect && (
        <div
          role="alert"
          data-testid={`mail-reconnect-${provider.id}`}
          className="mt-3 pt-3 border-t flex items-start justify-between gap-3"
        >
          <p className="text-xs text-amber-900 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {label} stopped syncing because its access expired. Reconnect to keep importing receipts.
          </p>
          <Button
            size="sm"
            className="rounded-full h-8 text-xs shrink-0"
            onClick={() => connect.mutate()}
            disabled={busy}
          >
            {connect.isPending ? "Connecting…" : "Reconnect"}
          </Button>
        </div>
      )}

      {retired && provider.connected && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
          {label} import is no longer available. Disconnect to remove Receebo's access to this inbox.
        </p>
      )}
    </div>
  );
}

/** "Connected accounts" body: one card per visible mail provider. */
export function MailConnections() {
  const { data, isLoading } = useMailStatus();

  if (isLoading) {
    return (
      <div className="border rounded-xl p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48 mt-2" />
      </div>
    );
  }

  const providers = data?.providers ?? [];
  if (providers.length === 0) {
    return (
      <div className="border rounded-xl p-5" data-testid="mail-providers-empty">
        <p className="text-xs text-muted-foreground">
          Automatic email import is coming soon. You can still upload or scan receipts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          pendingCount={data?.pendingCount ?? 0}
        />
      ))}
    </div>
  );
}

export type { MailProviderId };
