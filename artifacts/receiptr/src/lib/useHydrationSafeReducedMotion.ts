import { useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";

const subscribe = () => () => {};
const serverSnapshot = () => false;

/** Browser media preferences must not change the first server/hydration tree. */
export function useHydrationSafeReducedMotion() {
  const reduce = useReducedMotion();
  return useSyncExternalStore(subscribe, () => !!reduce, serverSnapshot);
}
