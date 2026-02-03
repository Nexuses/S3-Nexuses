import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

/** Use in Route Handlers: pass the request so the JWT cookie is read correctly. */
export async function getSession(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.email) return null;
  return {
    user: {
      id: token.id ?? token.sub,
      email: token.email,
      role: token.role,
    },
    expires: token.exp ? new Date(token.exp * 1000).toISOString() : "",
  };
}

export async function requireAuth(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.user) return null;
  return session;
}

export async function requireAdmin(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return null;
  }
  return session;
}
