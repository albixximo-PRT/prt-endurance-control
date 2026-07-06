import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

const KEY = "prt:endurance:live"

export async function GET() {
  try {
    const state = await redis.get(KEY)

    return Response.json({
      ok: true,
      state: state ?? null,
    })
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: err?.message || "Errore lettura stato live",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    await redis.set(KEY, body)

    return Response.json({
      ok: true,
    })
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: err?.message || "Errore scrittura stato live",
      },
      { status: 500 }
    )
  }
}