"use client"

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

  if (!audioEnabled) {
    return (
      <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
        <button
          onClick={async () => {
  lastAudioIdRef.current = state?.audioEvent?.id ?? null
  setAudioEnabled(true)
  await requestWakeLock()
}}
          className="flex h-full w-full flex-col items-center justify-center text-center"
        >
          <div className="mb-8 text-xs font-black uppercase tracking-[0.45em] text-emerald-400">
            Poison Racing Team
          </div>

          <div className="mb-5 text-5xl font-black leading-none">
            PRT
          </div>

          <div className="mb-12 text-xl font-black uppercase tracking-[0.25em] text-zinc-400">
            Endurance Control
          </div>

          <div className="rounded-[2rem] bg-emerald-500 px-10 py-7 text-3xl font-black text-black shadow-2xl">
            ATTIVA AUDIO
          </div>

          <div className="mt-8 max-w-xs text-sm font-bold text-zinc-500">
            Tocca una volta per abilitare la chiamata audio dei Team.
          </div>
        </button>
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