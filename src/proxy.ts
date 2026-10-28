import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// The creator page (/admin) and its APIs are gated by ADMIN_PASSCODE, not
// Clerk, and /api/images/* must stay public so Meta can fetch library images.
const ADMIN_PREFIXES = ['/admin', '/api/admin', '/api/images']

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }
  try {
    return await clerkMiddleware()(req, {} as any)
  } catch (e) {
    // If Clerk fails (e.g. domain not fully verified), let the request through
    console.error('Clerk middleware error:', e)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
