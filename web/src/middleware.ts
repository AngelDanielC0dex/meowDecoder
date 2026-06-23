import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Localize everything except API routes, the (non-localized) Auth.js pages,
  // Next internals and static files.
  matcher: ["/((?!api|auth|_next|_vercel|models|.*\\..*).*)"],
};
