// Only the independent capture config resolves this module. No credentials.
// transformIndexHtml sets this language from the server's active CAPTURE_CONTEXT.
const portuguese = document.documentElement.lang.startsWith("pt");
const user = {
  id: "fictional-capture",
  fullName: portuguese ? "Coleção de exemplo" : "Sample collection",
  firstName: portuguese ? "Coleção" : "Sample",
  primaryEmailAddress: null,
};
export const useAuth = () => ({ isSignedIn: true, isLoaded: true, userId: user.id });
export const useUser = () => ({ user, isLoaded: true, isSignedIn: true });
export const useClerk = () => ({ signOut: () => { throw new Error("Disabled in capture"); } });
