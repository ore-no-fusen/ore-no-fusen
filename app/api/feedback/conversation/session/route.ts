import { NextResponse } from 'next/server';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' };

export async function POST(_request: Request) {
  return NextResponse.json({ error: 'Image upload unavailable' }, { status: 503, headers });
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
