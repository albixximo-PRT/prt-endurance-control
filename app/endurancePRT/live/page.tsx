"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

type LiveState = {
  running: boolean
  timerMs: number
  status: "READY" | "WAITING" | "GO" | "STARTING" | "ARMED" | "PREPARING"
  activeTeam: { teamNumber: string; releaseTime: string } | null
  nextTeam: { teamNumber: string; releaseTime: string } | null
  calledTeams: string[]
  audioEvent: { id: string; src: string; volume: number } | null
  updatedAt: number
}

export default function EnduranceLivePage() {
  const [state, setState] = useState<LiveState | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [localNow, setLocalNow] = useState(Date.now())
  const lastAudioIdRef = useRef<string | null>(null)
  const timerSyncRef = useRef<{
  timerMs: number
  receivedAt: number
} | null>(null)
  const wakeLockRef = useRef<any>(null)

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen")
    }
  } catch {}
}

useEffect(() => {
  const timer = setTimeout(() => {
    setShowSplash(false)
  }, 5000)

  return () => clearTimeout(timer)
}, [])  

useEffect(() => {
  const interval = window.setInterval(() => {
    setLocalNow(Date.now())
  }, 16)

  return () => window.clearInterval(interval)
}, [])

useEffect(() => {
  const interval = window.setInterval(async () => {
    try {
      const res = await fetch("/api/endurance-live", { cache: "no-store" })
      const data = await res.json()
      const nextState = data.state ?? null

      setState(nextState)

      if (nextState?.running) {
        const currentSync = timerSyncRef.current

        if (!currentSync) {
          timerSyncRef.current = {
            timerMs: nextState.timerMs ?? 0,
            receivedAt: Date.now(),
          }
        }
      } else {
        timerSyncRef.current = null
      }
    } catch {}
  }, 350)

  return () => window.clearInterval(interval)
}, [])

  useEffect(() => {
  if (!audioEnabled) return

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      requestWakeLock()
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)

  return () => {
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange
    )

    wakeLockRef.current?.release?.()
    wakeLockRef.current = null
  }
}, [audioEnabled])

  useEffect(() => {
    if (!audioEnabled) return
    if (!state?.audioEvent) return
    if (lastAudioIdRef.current === state.audioEvent.id) return

    lastAudioIdRef.current = state.audioEvent.id

    const audio = new Audio(state.audioEvent.src)
audio.volume = state.audioEvent.volume ?? 1
audio.play().catch(() => {})
  }, [audioEnabled, state?.audioEvent])

  const shownTeam =
  state?.activeTeam?.teamNumber ||
  state?.nextTeam?.teamNumber ||
  "--"

  const nextTeam = state?.nextTeam?.teamNumber || "--"
  const isGo = Boolean(state?.activeTeam)
const isPreparing = state?.status === "PREPARING"
const calledTeams = state?.calledTeams ?? []
const nextReleaseTime = state?.nextTeam?.releaseTime ?? ""
const cleanNextReleaseTime = nextReleaseTime.replace("+", "").trim()

const mmssMatch = cleanNextReleaseTime.match(/^(\d+):(\d{2})\.(\d{3})$/)
const ssMatch = cleanNextReleaseTime.match(/^(\d+)\.(\d{3})$/)

const nextReleaseMs = mmssMatch
  ? Number(mmssMatch[1]) * 60000 +
    Number(mmssMatch[2]) * 1000 +
    Number(mmssMatch[3])
  : ssMatch
    ? Number(ssMatch[1]) * 1000 + Number(ssMatch[2])
    : 0

const localTimerMs = timerSyncRef.current
  ? timerSyncRef.current.timerMs +
    Math.max(0, localNow - timerSyncRef.current.receivedAt)
  : state?.timerMs ?? 0

const timeToNextGo = nextReleaseMs - localTimerMs

  if (showSplash) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black">
      <Image
        src="/endurance/splash.png"
        alt="PRT Endurance Control"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/10" />
    </main>
  )
}
  
  if (!audioEnabled) {
  return (
    <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
      <button
        onClick={async () => {
          lastAudioIdRef.current = state?.audioEvent?.id ?? null
          setAudioEnabled(true)
          await requestWakeLock()
        }}
        className="flex h-full w-full flex-col items-center justify-center text-center active:scale-[0.98]"
      >
        <Image
          src="/endurance/logo.png"
          alt="Poison Racing Team"
          width={210}
          height={210}
          priority
          className="mb-7 object-contain"
        />

        <div className="mb-10 text-sm font-black uppercase tracking-[0.38em] text-zinc-300">
          Endurance Division
        </div>

        <div className="rounded-[2rem] border border-yellow-200/80 bg-gradient-to-b from-yellow-200 via-amber-400 to-yellow-700 px-9 py-7 text-3xl font-black leading-tight text-black shadow-[0_0_45px_rgba(251,191,36,0.65)]">
          <span className="block">ENTRA IN</span>
<span className="block">RACE CONTROL</span>
        </div>

        <div className="mt-8 max-w-xs text-sm font-bold leading-relaxed text-zinc-500">
          Tocca per accedere alla procedura di partenza e attivare l’audio dei Team.
        </div>
      </button>
    </main>
  )
}

if (
  !state?.running &&
  state?.status !== "PREPARING"
) {
  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-black px-8 text-center text-white">
      <div>
        <div className="mb-6 text-2xl font-black uppercase tracking-[0.25em] text-amber-400">
          Race Control
        </div>

        <div className="mb-8 text-4xl font-black">
          Procedura non ancora avviata
        </div>

        <div className="max-w-sm text-lg leading-relaxed text-zinc-400">
          Rimani in attesa.
          <br />
          La Direzione Gara avvierà a breve la sequenza di partenza.
        </div>
      </div>
    </main>
  )
}

  return (
  <main
    className={`h-dvh w-screen overflow-hidden text-white transition-colors duration-150 ${
      isGo ? "bg-emerald-600" : "bg-black"
    }`}
  >
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="fixed right-4 top-4 z-50 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white backdrop-blur active:scale-95"
    >
      ↻ Refresh
    </button>

    <div className="flex h-full w-full flex-col items-center justify-between px-5 py-7 text-center">
        <header className="w-full">
          <div className="text-[10px] font-black uppercase tracking-[0.45em] text-zinc-400">
            PRT Endurance
          </div>

          <div className="mt-3 h-1 w-full rounded-full bg-white/10">
            <div
              className={`h-1 rounded-full ${
                isGo ? "bg-white" : "bg-emerald-500"
              }`}
              style={{ width: state?.running ? "100%" : "35%" }}
            />
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center">
          <div
            className={`mb-5 rounded-full px-6 py-2 text-sm font-black uppercase tracking-[0.28em] ${
              isGo
                ? "bg-white text-emerald-700"
                : "bg-white/10 text-zinc-300"
            }`}
          >
            {isGo ? "GO" : "Team in chiamata"}
          </div>

          <div className="text-[46vw] font-black leading-[0.82] tracking-[-0.08em]">
            {shownTeam}
          </div>

          <div className="mt-7 text-2xl font-black uppercase tracking-[0.25em] text-white/80">
            {isGo ? "Partenza" : state?.running || isPreparing ? "Preparati" : "In attesa"}
          </div>
        </section>

        <div className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
  <div className="mb-3 text-[10px] font-black uppercase tracking-[0.32em] text-zinc-400">
    Team rilasciati
  </div>

  <div className="flex min-h-12 flex-wrap justify-center gap-2">
    {calledTeams.map((teamNumber, index) => (
      <div
        key={`${teamNumber}-${index}`}
        className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 text-xl font-black text-white"
      >
        {teamNumber}
      </div>
    ))}
  </div>
</div>
        
        <footer className="w-full rounded-[2rem] border border-white/10 bg-white/5 px-5 py-5">
  <div className="text-[10px] font-black uppercase tracking-[0.35em] text-zinc-400">
    Prossima partenza
  </div>

  <div
  className={`mt-2 text-4xl font-black leading-none ${
    isGo
      ? "text-emerald-400"
      : timeToNextGo > 6000
        ? "text-white"
        : timeToNextGo > 3000
          ? "text-red-500"
          : "text-orange-400"
  }`}
>
  {isGo
    ? "START"
    : timeToNextGo > 0
      ? `${Math.floor(timeToNextGo / 1000)}.${String(
          Math.floor(timeToNextGo % 1000)
        ).padStart(3, "0")}`
      : ""}
</div>
</footer>
      </div>
    </main>
  )
}