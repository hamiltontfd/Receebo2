import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSupport,
} from "@/lib/pushNotifications";

type Status = "loading" | "unsupported" | "blocked" | "disabled" | "enabled";

export function PushNotificationSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    void getPushSupport()
      .then((support) => {
        if (!active) return;
        if (!support.supported) {
          setStatus("unsupported");
          setMessage(support.reason);
        } else if (support.permission === "denied") {
          setStatus("blocked");
          setMessage("Notifications are blocked in this browser's settings.");
        } else {
          setStatus(support.subscription ? "enabled" : "disabled");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("unsupported");
          setMessage("Push notifications are unavailable on this device.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => {
    setIsPending(true);
    try {
      await enablePushNotifications();
      setStatus("enabled");
      toast({
        title: "Push notifications enabled",
        description: "We'll alert this device before a return window closes.",
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Could not enable notifications.";
      if (Notification.permission === "denied") setStatus("blocked");
      toast({ title: "Notifications not enabled", description, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const disable = async () => {
    setIsPending(true);
    try {
      await disablePushNotifications();
      setStatus("disabled");
      toast({ title: "Push notifications disabled" });
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Could not disable notifications.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 pt-4 border-t">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
          {status === "enabled" ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status === "enabled"
              ? "This device will receive return-window reminders."
              : message || "Get reminders on this device, even when Receebo is closed."}
          </p>
        </div>
      </div>

      {status === "loading" ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-2" />
      ) : status === "enabled" ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full h-8 text-xs shrink-0"
          disabled={isPending}
          onClick={() => void disable()}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Disable"}
        </Button>
      ) : status === "disabled" ? (
        <Button
          size="sm"
          className="rounded-full h-8 text-xs shrink-0"
          disabled={isPending}
          onClick={() => void enable()}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enable"}
        </Button>
      ) : null}
    </div>
  );
}