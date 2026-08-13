import { convexAuth } from "@convex-dev/auth/server";
import { phonePassword } from "./auth/credentials";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [phonePassword, emailOtp],
});
