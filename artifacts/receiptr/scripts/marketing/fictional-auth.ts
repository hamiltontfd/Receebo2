// Only the independent capture config resolves this module. No credentials.
const user = { id: "fictional-capture", fullName: "Sample collection", firstName: "Sample", primaryEmailAddress: null };
export const useAuth = () => ({ isSignedIn: true, isLoaded: true, userId: user.id });
export const useUser = () => ({ user, isLoaded: true, isSignedIn: true });
export const useClerk = () => ({ signOut: () => { throw new Error("Disabled in capture"); } });
