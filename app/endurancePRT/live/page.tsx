"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

type LiveState = {
  running: boolean
  status: "READY" | "WAITING" | "GO"
  activeTeam: { teamNumber: string; releaseTime: string } | null
  nextTeam: { teamNumber: string; releaseTime: string } | null
  audioEvent: { id: string; src: string; volume: number } | null
  updatedAt: number
}

export default function EnduranceLivePage() {
  const [state, setState] = useState<LiveState | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const lastAudioIdRef = useRef<string | null>(null)
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

if (!state?.running && !state?.audioEvent) {
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
            {isGo ? "Partenza" : state?.running ? "Preparati" : "In attesa"}
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