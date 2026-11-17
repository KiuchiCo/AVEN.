import { NextResponse } from 'next/server';

const cookieName = 'aven-workspace-id';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { workspaceId?: unknown } | null;
  const response = NextResponse.json({ ok: true });
  if (typeof body?.workspaceId !== 'string' || !uuidPattern.test(body.workspaceId)) {
    response.cookies.delete(cookieName);
    return response;
  }
  response.cookies.set(cookieName, body.workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
