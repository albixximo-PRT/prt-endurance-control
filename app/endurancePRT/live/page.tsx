"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

type LiveState = {
  running: boolean
  timerMs: number
  status: "READY" | "WAITING" | "GO" | "STARTING" | "ARMED" | "PREPARING"
  activeTeam: { teamNumber: string; releaseTime: string } | null
  nextTeam: { teamNumber: string; releaseTime: string } | null
  audioEvent: { id: string; src: string; volume: number } | null
  updatedAt: number
}

function parseReleaseTimeToMs(value: string) {
  const clean = String(value || "").replace("+", "").trim()

  const mmss = clean.match(/^(\d+):(\d{2})\.(\d{3})$/)
  if (mmss) {
    return Number(mmss[1]) * 60000 + Number(mmss[2]) * 1000 + Number(mmss[3])
  }

  const ss = clean.match(/^(\d+)\.(\d{3})$/)
  if (ss) {
    return Number(ss[1]) * 1000 + Number(ss[2])
  }

  return 0
}

export default function EnduranceLivePage() {
  const [state, setState] = useState<LiveState | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [segmentStartMs, setSegmentStartMs] = useState(0)

  const lastAudioIdRef = useRef<string | null>(null)
  const wakeLockRef = useRef<any>(null)
  const lastNextTeamRef = useRef<string | null>(null)

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
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch("/api/endurance-live", { cache: "no-store" })
        const data = await res.json()
        setState(data.state ?? null)
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
      document.removeEventListener("visibilitychange", handleVisibilityChange)
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

  useEffect(() => {
    const currentNextTeam = state?.nextTeam?.teamNumber ?? null

    if (currentNextTeam !== lastNextTeamRef.current) {
      lastNextTeamRef.current = currentNextTeam
      setSegmentStartMs(state?.timerMs ?? 0)
    }

    if (state?.status === "PREPARING") {
      setSegmentStartMs(0)
    }
  }, [state?.nextTeam?.teamNumber, state?.status, state?.timerMs])

  const shownTeam =
    state?.activeTeam?.teamNumber ||
    state?.nextTeam?.teamNumber ||
    "--"

  const nextTeam = state?.nextTeam?.teamNumber || "--"
  const isGo = Boolean(state?.activeTeam)
  const isPreparing = state?.status === "PREPARING"

  const currentTimerMs = state?.timerMs ?? 0
  const nextReleaseMs = state?.nextTeam
    ? parseReleaseTimeToMs(state.nextTeam.releaseTime)
    : 0

  const totalSegmentMs = Math.max(1, nextReleaseMs - segmentStartMs)
  const elapsedSegmentMs = Math.max(0, currentTimerMs - segmentStartMs)

  const callProgress = isGo
    ? 100
    : isPreparing
      ? 8
      : state?.running && state?.nextTeam
        ? Math.min(100, Math.max(0, (elapsedSegmentMs / totalSegmentMs) * 100))
        : 0

  const timeToNextMs = state?.nextTeam
    ? Math.max(0, nextReleaseMs - currentTimerMs)
    : 0

  const timeToNextLabel =
    isGo
      ? "GO"
      : state?.running && state?.nextTeam
        ? `${(timeToNextMs / 1000).toFixed(1)}s`
        : isPreparing
          ? "READY"
          : "--"

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
      <div className="flex h-full w-full flex-col items-center justify-between px-5 py-7 text-center">
        <header className="w-full">
          <div className="text-[10px] font-black uppercase tracking-[0.45em] text-zinc-400">
            PRT Endurance
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
              <span>Chiamata Team</span>
              <span>{timeToNextLabel}</span>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isGo
                    ? "bg-white shadow-[0_0_35px_rgba(255,255,255,0.95)]"
                    : "bg-gradient-to-r from-emerald-900 via-emerald-400 to-white shadow-[0_0_35px_rgba(16,185,129,0.95)]"
                }`}
                style={{ width: `${callProgress}%` }}
              />
            </div>
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

        <footer className="w-full rounded-[2rem] border border-white/10 bg-white/5 px-5 py-5">
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-zinc-400">
            Prossimo Team
          </div>

          <div className="mt-2 text-4xl font-black leading-none">
            {nextTeam}
          </div>
        </footer>
      </div>
    </main>
  )
}