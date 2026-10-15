import { NextResponse } from 'next/server';
export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok', service: 'patchlens' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
