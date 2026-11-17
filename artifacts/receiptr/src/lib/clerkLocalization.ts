import type { AppLocale } from "./locale";

/** Only the auth subtitles are customized; there is no product-speed promise. */
export function clerkLocalization(_locale: AppLocale) {
  return {
    signIn: {
      start: {
        title: "Sign in to Receebo",
        subtitle: "Welcome back. Please sign in to continue.",
      },
    },
    signUp: {
      start: {
        title: "Create your Receebo account",
        subtitle: "Start organizing every receipt.",
      },
    },
  };
}
