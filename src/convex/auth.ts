import { convexAuth } from "@convex-dev/auth/server";
import { phonePassword } from "./auth/credentials";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [phonePassword],
});
