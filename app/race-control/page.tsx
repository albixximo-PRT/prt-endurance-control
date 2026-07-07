"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

type ReleaseRow = {
  teamNumber: string
  teamName: string
  position: number
  pilot: string
  releaseTime: string
}

type ReleasedLog = {
  teamNumber: string
  releaseTime: string
  spokenText: string
}

type LiveAudioEvent = {
  id: string
  src: string
  volume: number
}

type LiveStatus = "READY" | "WAITING" | "GO" | "STARTING" | "ARMED"

const RELEASE_GRID_KEY = "prt-endurance-release-grid"
const TEAM_CALL_LEAD_MS = 1000
const AUDIO_VOLUME = {
  initVoice: 1,
  initTick: 1,
  heartbeatTick: 0.35,
  alertTick: 1,
  teamVoice: 1,
  finishVoice: 1,
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

function formatTimer(ms: number) {
  const safe = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(safe / 60000)
  const seconds = Math.floor((safe % 60000) / 1000)
  const millis = safe % 1000

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

export default function RaceControlPage() {
  const [releaseGrid, setReleaseGrid] = useState<ReleaseRow[]>([])
  const [timerMs, setTimerMs] = useState(0)
  const [running, setRunning] = useState(false)
const [starting, setStarting] = useState(false)
const [activeTeam, setActiveTeam] = useState<ReleaseRow | null>(null)
  const [releasedTeams, setReleasedTeams] = useState<string[]>([])
  const [releasedLog, setReleasedLog] = useState<ReleasedLog[]>([])
  const [spokenTeams, setSpokenTeams] = useState<string[]>([])
  const [liveAudioEvent, setLiveAudioEvent] = useState<LiveAudioEvent | null>(null)
  

  const startRef = useRef<number | null>(null)

  const audioQueueRef = useRef<{ src: string; volume: number }[]>([])
  const audioPlayingRef = useRef(false)
  const initializedRef = useRef(false)

  const lastHeartbeatRef = useRef(0)
  const finishQueuedRef = useRef(false)
  const heartbeatSinceLastTeamRef = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RELEASE_GRID_KEY)
      if (saved) {
        const parsed: ReleaseRow[] = JSON.parse(saved)

        const sorted = parsed
          .slice()
          .sort(
            (a, b) =>
              parseReleaseTimeToMs(a.releaseTime) -
              parseReleaseTimeToMs(b.releaseTime)
          )

        setReleaseGrid(sorted)
      }
    } catch {
      setReleaseGrid([])
    }
  }, [])

  useEffect(() => {
    if (!running) return

    const interval = window.setInterval(() => {
      if (startRef.current == null) return
      setTimerMs(Date.now() - startRef.current)
    }, 10)

    return () => window.clearInterval(interval)
  }, [running])

  function playAudio(src: string, volume = 0.35, statusOverride?: LiveStatus) {
  const audioEvent = {
    id: `${Date.now()}-${Math.random()}`,
    src,
    volume,
  }

  setLiveAudioEvent(audioEvent)

  fetch("/api/endurance-live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      running,
      timerMs,
      status: statusOverride ?? (
  starting
    ? "STARTING"
    : activeTeam
      ? "GO"
      : running
        ? "WAITING"
        : "READY"
),
      activeTeam: activeTeam
        ? {
            teamNumber: activeTeam.teamNumber,
            releaseTime: activeTeam.releaseTime,
          }
        : null,
      nextTeam: nextTeam
        ? {
            teamNumber: nextTeam.teamNumber,
            releaseTime: nextTeam.releaseTime,
          }
        : null,
      audioEvent,
      updatedAt: Date.now(),
    }),
  }).catch(() => {})

  return new Promise<void>((resolve) => {
    const audio = new Audio(src)
    audio.volume = volume

    audio.onended = () => resolve()
    audio.onerror = () => resolve()

    audio.play().catch(() => resolve())
  })
}

  function playNextAudio() {
    if (audioPlayingRef.current) return

    const next = audioQueueRef.current.shift()
if (!next) return

audioPlayingRef.current = true

playAudio(next.src, next.volume).then(() => {
      audioPlayingRef.current = false
      playNextAudio()
    })
  }

  function enqueueAudio(src: string, volume = 0.35) {
  audioQueueRef.current.push({ src, volume })
  playNextAudio()
}

  async function runInitSequence() {
    initializedRef.current = true
    setStarting(true)

await playAudio("/system/pre-start.mp3", AUDIO_VOLUME.initVoice, "STARTING")

await new Promise((r) => setTimeout(r, 1000))

for (let i = 0; i < 8; i++) {
  await playAudio("/system/tick.wav", AUDIO_VOLUME.heartbeatTick, "STARTING")

  if (i < 7) {
    await new Promise((r) => setTimeout(r, 2000))
  }
}

await new Promise((r) => setTimeout(r, 1000))

setStarting(false)

await playAudio("/system/init.mp3", AUDIO_VOLUME.initVoice, "ARMED")

await new Promise((r) => setTimeout(r, 500))

    await playAudio("/system/tick.wav", AUDIO_VOLUME.initTick)
    await new Promise((r) => setTimeout(r, 900))

    await playAudio("/system/tick.wav", AUDIO_VOLUME.initTick)
    await new Promise((r) => setTimeout(r, 900))

    await playAudio("/system/tick.wav", AUDIO_VOLUME.initTick)
    await new Promise((r) => setTimeout(r, 900))

    await playAudio("/system/tick.wav", AUDIO_VOLUME.initTick)
    await new Promise((r) => setTimeout(r, 700))

    await playAudio("/system/tick.wav", AUDIO_VOLUME.initTick)

await new Promise((r) => setTimeout(r, 200))

startRef.current = Date.now()
setTimerMs(0)
setRunning(true)
}

  useEffect(() => {
    if (!running) return

    for (const team of releaseGrid) {
      const alreadyReleased = releasedTeams.includes(team.teamNumber)
      if (alreadyReleased) continue

      const releaseMs = parseReleaseTimeToMs(team.releaseTime)

      if (timerMs >= releaseMs) {
        const spokenText = `Team ${team.teamNumber}`

        setActiveTeam(team)
        setReleasedTeams((prev) => [...prev, team.teamNumber])
        setReleasedLog((prev) => [
          {
            teamNumber: team.teamNumber,
            releaseTime: team.releaseTime,
            spokenText,
          },
          ...prev,
        ])

        window.setTimeout(() => {
          setActiveTeam((current) =>
            current?.teamNumber === team.teamNumber ? null : current
          )
        }, 1400)

        break
      }
    }
  }, [timerMs, running, releaseGrid, releasedTeams])
  useEffect(() => {
  if (!running) return

  for (const team of releaseGrid) {
    const alreadySpoken = spokenTeams.includes(team.teamNumber)
    if (alreadySpoken) continue

    const releaseMs = parseReleaseTimeToMs(team.releaseTime)
    const audioStartMs = releaseMs - TEAM_CALL_LEAD_MS

    if (timerMs >= audioStartMs) {
      setSpokenTeams((prev) => [...prev, team.teamNumber])

      

enqueueAudio(
  `/audio/team-${team.teamNumber}.mp3`,
  AUDIO_VOLUME.teamVoice
)

      heartbeatSinceLastTeamRef.current = false

      break
    }
  }
}, [timerMs, running, releaseGrid, spokenTeams])

  const nextTeams = releaseGrid.filter(
    (team) => !releasedTeams.includes(team.teamNumber)
  )

  const nextTeam = nextTeams[0] || null
  useEffect(() => {
  const payload = {
    running,
    timerMs,
    status: starting
  ? "STARTING"
  : activeTeam
    ? "GO"
    : running
      ? "WAITING"
      : "READY",
    activeTeam: activeTeam
      ? {
          teamNumber: activeTeam.teamNumber,
          releaseTime: activeTeam.releaseTime,
        }
      : null,
    nextTeam: nextTeam
      ? {
          teamNumber: nextTeam.teamNumber,
          releaseTime: nextTeam.releaseTime,
        }
      : null,
    audioEvent: liveAudioEvent,
    updatedAt: Date.now(),
  }

  fetch("/api/endurance-live", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}, [running, starting, activeTeam, nextTeam, liveAudioEvent])

  useEffect(() => {
    if (!running) return
    if (!nextTeam) return
    if (activeTeam) return
    if (audioPlayingRef.current) return
    if (audioQueueRef.current.length > 0) return

    const nextReleaseMs = parseReleaseTimeToMs(nextTeam.releaseTime)
    const timeToNext = nextReleaseMs - timerMs

    if (timeToNext <= 1800) return

    const now = Date.now()
    if (now - lastHeartbeatRef.current < 1000) return

    const isLastTickBeforeTeam = timeToNext <= TEAM_CALL_LEAD_MS + 1500

lastHeartbeatRef.current = now
enqueueAudio(
  "/system/tick.wav",
  isLastTickBeforeTeam
    ? AUDIO_VOLUME.alertTick
    : AUDIO_VOLUME.heartbeatTick
)

heartbeatSinceLastTeamRef.current = true
  }, [timerMs, running, nextTeam, activeTeam])

  useEffect(() => {
    if (!running) return
    if (!releaseGrid.length) return
    if (finishQueuedRef.current) return
    if (releasedTeams.length < releaseGrid.length) return

    finishQueuedRef.current = true

    window.setTimeout(() => {
      enqueueAudio("/system/finish.mp3", AUDIO_VOLUME.finishVoice)
    }, 2000)
  }, [running, releasedTeams, releaseGrid])

  return (
    <main className="h-screen overflow-hidden bg-black p-4 text-white">
            <div className="fixed left-4 top-4 z-50">
        <Link
          href="/"
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur hover:bg-white/20"
        >
          ← TEMPI
        </Link>
      </div>
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-4"></div>
        <div className="mb-4 text-center">
  <div className="text-7xl font-black font-mono">
    {formatTimer(timerMs)}
  </div>

  <div className="mt-1 text-base font-bold tracking-widest text-zinc-300">
    PRT ENDURANCE CONTROL
  </div>
</div>

        <div className="mb-4 text-center">
  <div className="text-2xl font-black text-zinc-300 tracking-wider">
    TEAM IN PARTENZA
  </div>

  <div className="text-[150px] leading-none font-black">
    {activeTeam?.teamNumber || "--"}
  </div>

  <div className="text-5xl font-black text-white">
    {activeTeam ? "GO!" : running ? "IN ATTESA" : "READY"}
  </div>
</div>

        {nextTeam ? (
  <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-center">
            <div className="mb-2 text-sm font-black uppercase text-zinc-400">
              Prossimo Team
            </div>

            <div className="text-3xl font-black">
              Team {nextTeam.teamNumber}
            </div>

            <div className="font-mono text-xl text-zinc-300">
              {nextTeam.releaseTime}
            </div>
          </div>
        ) : (
          <div className="mb-8 text-3xl font-black text-zinc-400">
            Tutti i Team sono stati rilasciati
          </div>
        )}

        <div className="mb-4 flex justify-center gap-3">
          <button
            onClick={() => {
              if (running) return

              if (!initializedRef.current) {
                runInitSequence()
                return
              }

              startRef.current = Date.now() - timerMs
              setRunning(true)
            }}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-xl font-black text-black"
          >
            START
          </button>

          <button
            onClick={() => setRunning(false)}
            className="rounded-xl bg-yellow-500 px-6 py-3 text-xl font-black text-black"
          >
            PAUSA
          </button>

          <button
            onClick={() => {
              setRunning(false)
              setTimerMs(0)
              setActiveTeam(null)
              setReleasedTeams([])
              setReleasedLog([])
              setSpokenTeams([])
              startRef.current = null
              audioQueueRef.current = []
              audioPlayingRef.current = false
              initializedRef.current = false
              lastHeartbeatRef.current = 0
              finishQueuedRef.current = false
              heartbeatSinceLastTeamRef.current = false
            }}
            className="rounded-xl bg-red-500 px-6 py-3 text-xl font-black text-black"
          >
            RESET
          </button>
        </div>

        <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-h-0 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-sm font-black uppercase text-zinc-400">
              Prossimi rilasci
            </div>

            {!nextTeams.length ? (
              <div className="text-zinc-500">Nessun Team in attesa.</div>
            ) : (
              <div className="max-h-full space-y-2 overflow-y-auto pr-1">
                {nextTeams.slice(0, 6).map((team) => (
                  <div
                    key={team.teamNumber}
                    className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3"
                  >
                    <div className="text-2xl font-black">
                      Team {team.teamNumber}
                    </div>

                    <div className="font-mono text-xl text-zinc-300">
                      {team.releaseTime}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-sm font-black uppercase text-zinc-400">
              Registro audio
            </div>

            {!releasedLog.length ? (
              <div className="text-zinc-500">Nessun Team rilasciato.</div>
            ) : (
              <div className="max-h-full space-y-2 overflow-y-auto pr-1">
                {releasedLog.slice(0, 6).map((log, index) => (
                  <div
                    key={`${log.teamNumber}-${index}`}
                    className="rounded-xl bg-black/30 px-4 py-3"
                  >
                    <div className="text-xl font-black">
                      ✓ Team {log.teamNumber}
                    </div>

                    <div className="font-mono text-sm text-zinc-400">
                      {log.releaseTime} — {log.spokenText}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}