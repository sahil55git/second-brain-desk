// First-run bootstrap (erp-architecture-plan.md, Phase 1). Only ever
// allows creating a user when the User table has zero rows — once the
// first Owner exists, this route always refuses, so it can never be used
// to mint extra accounts later (that will be an Owner-only "Users"
// screen in a future phase, not this route).
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, safeDbCall } from "@/lib/db";

export async function GET() {
  const result = await safeDbCall(() => prisma.user.count());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ needsSetup: result.data === 0 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, name } = body;

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return NextResponse.json(
      { error: "username must be at least 3 characters" },
      { status: 400 }
    );
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const countResult = await safeDbCall(() => prisma.user.count());
  if (!countResult.ok) {
    return NextResponse.json({ error: countResult.error }, { status: 503 });
  }
  if (countResult.data > 0) {
    return NextResponse.json(
      { error: "Setup already completed. Use the normal login." },
      { status: 403 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await safeDbCall(() =>
    prisma.user.create({
      data: {
        username: username.trim().toLowerCase(),
        passwordHash,
        name,
        role: "OWNER",
        active: true,
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: { username: result.data.username } }, { status: 201 });
}
