"use client"

import { useEffect, useRef, useState } from "react"

type LiveState = {
  running: boolean
  status: "READY" | "WAITING" | "GO"
  activeTeam: { teamNumber: string; releaseTime: string } | null
  nextTeam: { teamNumber: string; releaseTime: string } | null
  audioEvent: { id: string; teamNumber: string; src: string } | null
  updatedAt: number
}

export default function EnduranceLivePage() {
  const [state, setState] = useState<LiveState | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const lastAudioIdRef = useRef<string | null>(null)

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch("/api/endurance-live", { cache: "no-store" })
        const data = await res.json()
        setState(data.state ?? null)
      } catch {}
    }, 500)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!audioEnabled) return
    if (!state?.audioEvent) return
    if (lastAudioIdRef.current === state.audioEvent.id) return

    lastAudioIdRef.current = state.audioEvent.id

    const audio = new Audio(state.audioEvent.src)
    audio.volume = 1
    audio.play().catch(() => {})
  }, [audioEnabled, state?.audioEvent])

  const teamNumber =
    state?.activeTeam?.teamNumber ||
    state?.audioEvent?.teamNumber ||
    state?.nextTeam?.teamNumber ||
    "--"

  const label = state?.activeTeam ? "GO!" : "TEAM IN CHIAMATA"

  return (
    <main
      className={`min-h-screen w-screen overflow-hidden text-white ${
        state?.activeTeam ? "bg-emerald-700" : "bg-black"
      }`}
    >
      {!audioEnabled ? (
        <button
          onClick={() => setAudioEnabled(true)}
          className="flex min-h-screen w-full flex-col items-center justify-center px-8 text-center"
        >
          <div className="mb-6 text-sm font-black tracking-[0.35em] text-zinc-400">
            PRT ENDURANCE CONTROL
          </div>

          <div className="rounded-3xl bg-emerald-500 px-10 py-6 text-3xl font-black text-black">
            ATTIVA AUDIO
          </div>
        </button>
      ) : (
        <div className="flex min-h-screen w-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-8 text-sm font-black tracking-[0.35em] text-zinc-400">
            PRT ENDURANCE
          </div>

          <div className="mb-6 text-3xl font-black text-zinc-300">
            {label}
          </div>

          <div className="text-[42vw] leading-none font-black">
            {teamNumber}
          </div>

          <div className="mt-6 text-6xl font-black">
            {state?.activeTeam ? "GO" : state?.running ? "READY" : "WAIT"}
          </div>
        </div>
      )}
    </main>
  )
}