import { useCallback, useEffect, useState } from "react";
import { useGetReceiptStats } from "@workspace/api-client-react";

const KEY_SEARCH_DONE = "receebo:onboarding:searchDone";
const KEY_DISMISSED = "receebo:onboarding:dismissed";

export interface OnboardingState {
  step1Done: boolean;
  step2Done: boolean;
  allDone: boolean;
  dismissed: boolean;
  markSearchDone: () => void;
  dismiss: () => void;
}

export function useOnboarding(): OnboardingState {
  const { data: stats } = useGetReceiptStats();

  const [searchDone, setSearchDone] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(KEY_SEARCH_DONE) === "true"
      : false
  );

  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(KEY_DISMISSED) === "true"
      : false
  );

  const step1Done = (stats?.totalReceipts ?? 0) > 0;
  const step2Done = searchDone;
  const allDone = step1Done && step2Done;

  const markSearchDone = useCallback(() => {
    if (!searchDone) {
      localStorage.setItem(KEY_SEARCH_DONE, "true");
      setSearchDone(true);
    }
  }, [searchDone]);

  const dismiss = useCallback(() => {
    localStorage.setItem(KEY_DISMISSED, "true");
    setDismissed(true);
  }, []);

  return { step1Done, step2Done, allDone, dismissed, markSearchDone, dismiss };
}
