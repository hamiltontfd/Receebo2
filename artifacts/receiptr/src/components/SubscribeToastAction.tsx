import { ToastAction } from "@/components/ui/toast";
import { SUBSCRIBE_HREF, TRIAL_CAP_BUTTON } from "@/lib/trialCopy";

/** "Subscribe" action for toasts that report the trial receipt cap. */
export function subscribeToastAction(navigate: (to: string) => void) {
  return (
    <ToastAction
      altText={TRIAL_CAP_BUTTON}
      onClick={() => navigate(SUBSCRIBE_HREF)}
      data-testid="toast-action-subscribe"
    >
      {TRIAL_CAP_BUTTON}
    </ToastAction>
  );
}
