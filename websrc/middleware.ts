import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/login", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  // Protect all routes except the login page, NextAuth endpoints, static files, and images
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"]
};
