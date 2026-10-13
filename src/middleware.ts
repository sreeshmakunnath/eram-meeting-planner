import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Every page needs a signed-in user; /admin/* needs the ADMIN role.
// Role checks are repeated on the server in each page and action (requireUser / requireAdmin).
export default withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname.startsWith("/admin") && req.nextauth.token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/?denied=1", req.url));
    }
    return NextResponse.next();
  },
  { pages: { signIn: "/login" } },
);

export const config = {
  matcher: ["/((?!login|forgot-password|set-password|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
