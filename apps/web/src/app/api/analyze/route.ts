import { NextResponse } from 'next/server';
import { analyze } from '@patchlens/core';
import { parseUnifiedDiff } from '@patchlens/git';
import { builtInRules } from '@patchlens/rules';
export const runtime = 'nodejs';
const MAX_BODY_BYTES = 1024 * 1024;
export async function POST(request: Request): Promise<NextResponse> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 },
    );
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES)
    return NextResponse.json(
      { error: 'Request exceeds 1 MiB limit' },
      { status: 413 },
    );
  try {
    if (!request.body)
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 },
      );
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: 'Request exceeds 1 MiB limit' },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown;
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid UTF-8 JSON' },
        { status: 400 },
      );
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof (payload as Record<string, unknown>).diff !== 'string' ||
      Object.keys(payload).some((key) => key !== 'diff')
    )
      return NextResponse.json(
        { error: 'Expected an object with one string field: diff' },
        { status: 400 },
      );
    return NextResponse.json(
      analyze(
        parseUnifiedDiff((payload as { diff: string }).diff),
        builtInRules,
      ),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 },
    );
  }
}
