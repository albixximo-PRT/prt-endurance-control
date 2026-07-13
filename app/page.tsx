"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import LappedTimeInput, { type ManualTimeParts } from "@/components/LappedTimeInput"

type ExtractedRow = {
  posizione: number
  pilota: string
  distacco: string
  tempoTotale: string
  teamNumber?: string
  matchedPilot?: string
matchStatus?: "safe" | "warning" | "missing"
matchScore?: number
aliasConfirmed?: boolean
isMissingFromResult?: boolean
officialPilot?: string

  fastestLap?: string
  lapsDown?: number
  manualTime?: ManualTimeParts
  calculatedGap?: string

  pvcpEnabled?: boolean
  pvcpCrashLap?: string
  pvcpRacePosition?: string
  pvcpFrontTeam?: string
  pvcpBackTeam?: string
  pvcpCalculatedGap?: string
}

type TeamRow = {
  id: string
  numeroTeam: string
  nomeTeam: string
  pilotaLobby1: string
  pilotaLobby2: string
  pilotaLobby3: string
}

type ReleaseRow = {
  teamNumber: string
  teamName: string
  position: number
  pilot: string
  releaseTime: string
  
}

const TEAMS_STORAGE_KEY = "prt-endurance-control-teams"
const TOTAL_RACE_LAPS = 36

function normalizeName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function levenshteinDistance(a: string, b: string): number {
  const aa = String(a || "")
  const bb = String(b || "")

  if (aa === bb) return 0
  if (!aa.length) return bb.length
  if (!bb.length) return aa.length

  const matrix = Array.from({ length: aa.length + 1 }, () =>
    Array(bb.length + 1).fill(0)
  )

  for (let i = 0; i <= aa.length; i++) matrix[i][0] = i
  for (let j = 0; j <= bb.length; j++) matrix[0][j] = j

  for (let i = 1; i <= aa.length; i++) {
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[aa.length][bb.length]
}

function computePilotSimilarityScore(rawName: string, officialName: string) {
  const raw = normalizeName(rawName)
  const official = normalizeName(officialName)

  if (!raw || !official) return 0
  if (raw === official) return 1

  const rawInOfficial = official.includes(raw)
  const officialInRaw = raw.includes(official)

  if (rawInOfficial || officialInRaw) {
    const shorter = Math.min(raw.length, official.length)
    const longer = Math.max(raw.length, official.length)
    const ratio = shorter / longer

    if (shorter >= 5 && ratio >= 0.45) {
      return 0.96 + Math.min(0.03, ratio * 0.03)
    }
  }

  const distance = levenshteinDistance(raw, official)
  const maxLen = Math.max(raw.length, official.length)

  let score = 1 - distance / maxLen

  if (raw[0] === official[0]) score += 0.02
  if (raw.slice(0, 4) === official.slice(0, 4)) score += 0.03
  if (raw.slice(-2) === official.slice(-2)) score += 0.02

  return Math.min(score, 0.99)
}

function createEmptyTeam(): TeamRow {
  return {
    id: crypto.randomUUID(),
    numeroTeam: "",
    nomeTeam: "",
    pilotaLobby1: "",
    pilotaLobby2: "",
    pilotaLobby3: "",
  }
}

function parseReleaseTimeToMs(value: string) {
  const clean = String(value || "")
    .replace("+", "")
    .trim()

  const mmss = clean.match(/^(\d+):(\d{2})\.(\d{3})$/)
  if (mmss) {
    return (
      Number(mmss[1]) * 60_000 +
      Number(mmss[2]) * 1_000 +
      Number(mmss[3])
    )
  }

  const ss = clean.match(/^(\d+)\.(\d{3})$/)
  if (ss) {
    return Number(ss[1]) * 1_000 + Number(ss[2])
  }

  return 0
}

function parseFullTimeToMs(value: string) {
  const clean = String(value || "")
    .replace("+", "")
    .trim()

  const hhmmss = clean.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/)
  if (hhmmss) {
    return (
      Number(hhmmss[1]) * 3_600_000 +
      Number(hhmmss[2]) * 60_000 +
      Number(hhmmss[3]) * 1_000 +
      Number(hhmmss[4])
    )
  }

  const mmss = clean.match(/^(\d+):(\d{2})\.(\d{3})$/)
  if (mmss) {
    return (
      Number(mmss[1]) * 60_000 +
      Number(mmss[2]) * 1_000 +
      Number(mmss[3])
    )
  }

  return 0
}

function formatFullGap(ms: number) {
  const safe = Math.max(0, Math.floor(ms))

  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1_000)
  const millis = safe % 1_000

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

function formatFullTime(ms: number) {
  const safe = Math.max(0, Math.floor(ms))

  const hours = Math.floor(safe / 3_600_000)
  const minutes = Math.floor((safe % 3_600_000) / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1_000)
  const millis = safe % 1_000

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

function getRowTotalTime(
  row: ExtractedRow | undefined,
  winnerTotalTime: string
) {
  if (!row) return ""

  if (row.tempoTotale) {
    return row.tempoTotale
  }

  const winnerTotalMs = parseFullTimeToMs(winnerTotalTime)
  const gapMs = parseReleaseTimeToMs(row.distacco)

  if (!winnerTotalMs) return ""

  return formatFullTime(winnerTotalMs + gapMs)
}

function calculateLappedGap(
  manualTotalTime: string,
  lapsDown: number,
  winnerFastestLap: string,
  winnerTotalTime: string,
  correctionSeconds: string
) {
  const manualTotalMs = parseFullTimeToMs(manualTotalTime)
  const winnerFastestLapMs = parseFullTimeToMs(winnerFastestLap)
  const winnerTotalMs = parseFullTimeToMs(winnerTotalTime)
  const correctionMs = Math.round(Number(correctionSeconds.replace(",", ".")) * 1000)

  if (!manualTotalMs || !lapsDown || !winnerFastestLapMs || !winnerTotalMs) {
    return ""
  }

  const gapMs =
    manualTotalMs +
    lapsDown * (winnerFastestLapMs + correctionMs) -
    winnerTotalMs

  if (gapMs <= 0) return ""

  return formatFullGap(gapMs)
}

function calculatePvcpGap(
  crashLap: number,
  racePosition: number,
  frontTeamTotalTime: string,
  backTeamTotalTime: string,
  winnerTotalTime: string,
  totalTeams: number
) {
  if (
    crashLap < 1 ||
    crashLap > TOTAL_RACE_LAPS ||
    racePosition < 1
  ) {
    return ""
  }

  const winnerTotalMs = parseFullTimeToMs(winnerTotalTime)
  const frontTotalMs = parseFullTimeToMs(frontTeamTotalTime)
  const backTotalMs = parseFullTimeToMs(backTeamTotalTime)

  if (!winnerTotalMs) return ""

  const missingLaps = TOTAL_RACE_LAPS - crashLap

  let recoveryIndexSeconds = 0
  let baseCrashOffsetSeconds = 0

  if (crashLap <= 9) {
    recoveryIndexSeconds = 4
    baseCrashOffsetSeconds = 5
  } else if (crashLap <= 18) {
    recoveryIndexSeconds = 3
    baseCrashOffsetSeconds = 10
  } else if (crashLap <= 27) {
    recoveryIndexSeconds = 2
    baseCrashOffsetSeconds = 15
  } else {
    recoveryIndexSeconds = 1
    baseCrashOffsetSeconds = 20
  }

  let referenceTimeMs = 0

  if (racePosition === 1) {
    if (!backTotalMs) return ""
    referenceTimeMs = backTotalMs - 5_000
  } else if (racePosition === totalTeams) {
    if (!frontTotalMs) return ""
    referenceTimeMs = frontTotalMs + 5_000
  } else {
    if (!frontTotalMs || !backTotalMs) return ""
    referenceTimeMs = Math.round(
      (frontTotalMs + backTotalMs) / 2
    )
  }

  const pvcpTotalMs =
    referenceTimeMs +
    missingLaps * recoveryIndexSeconds * 1_000 +
    baseCrashOffsetSeconds * 1_000

  const gapMs = pvcpTotalMs - winnerTotalMs

  if (gapMs <= 0) return "00:00.000"

  return formatFullGap(gapMs)
}

function getPvcpDetails(crashLapValue?: string) {
  const crashLap = Number(crashLapValue)

  if (
    !Number.isInteger(crashLap) ||
    crashLap < 1 ||
    crashLap > TOTAL_RACE_LAPS
  ) {
    return null
  }

  const missingLaps = TOTAL_RACE_LAPS - crashLap

  if (crashLap <= 9) {
    return {
      sector: "Q1",
      missingLaps,
      recoveryIndexSeconds: 4,
      baseCrashOffsetSeconds: 5,
    }
  }

  if (crashLap <= 18) {
    return {
      sector: "Q2",
      missingLaps,
      recoveryIndexSeconds: 3,
      baseCrashOffsetSeconds: 10,
    }
  }

  if (crashLap <= 27) {
    return {
      sector: "Q3",
      missingLaps,
      recoveryIndexSeconds: 2,
      baseCrashOffsetSeconds: 15,
    }
  }

  return {
    sector: "Q4",
    missingLaps,
    recoveryIndexSeconds: 1,
    baseCrashOffsetSeconds: 20,
  }
}

function manualTimePartsToFullTime(value?: ManualTimeParts) {
  if (!value) return ""

  const hh = value.hh.padStart(2, "0")
  const mm = value.mm.padStart(2, "0")
  const ss = value.ss.padStart(2, "0")
  const ms = value.ms.padStart(3, "0")

  if (
    value.hh.length !== 2 ||
    value.mm.length !== 2 ||
    value.ss.length !== 2 ||
    value.ms.length !== 3
  ) {
    return ""
  }

  return `${hh}:${mm}:${ss}.${ms}`
}

function formatTimer(ms: number) {
  const safe = Math.max(0, Math.floor(ms))

  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1_000)
  const millis = safe % 1_000

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<ExtractedRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [selectedLobby, setSelectedLobby] = useState<1 | 2 | 3>(1)
  const [missingRowsData, setMissingRowsData] = useState<
  Record<string, Partial<ExtractedRow>>
>({})
  const [debugText, setDebugText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [timerMs, setTimerMs] = useState(0)
  const [lappedCorrectionSeconds, setLappedCorrectionSeconds] = useState("3.000")
const [timerRunning, setTimerRunning] = useState(false)
const timerStartRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEAMS_STORAGE_KEY)
      if (saved) setTeams(JSON.parse(saved))
    } catch {
      setTeams([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teams))
  }, [teams])

  useEffect(() => {
  if (!timerRunning) return

  const interval = window.setInterval(() => {
    if (timerStartRef.current == null) return
    setTimerMs(Date.now() - timerStartRef.current)
  }, 25)

  return () => window.clearInterval(interval)
}, [timerRunning])

 function getPilotForSelectedLobby(team: TeamRow) {
  if (selectedLobby === 1) return team.pilotaLobby1
  if (selectedLobby === 2) return team.pilotaLobby2
  return team.pilotaLobby3
} 

function findPilotMatch(pilotName: string) {
  const candidates = teams
    .map((team) => {
      const pilot = getPilotForSelectedLobby(team)

      return {
        pilot,
        teamNumber: team.numeroTeam,
        score: computePilotSimilarityScore(pilotName, pilot),
      }
    })
    .filter((candidate) => candidate.pilot)

  const ranked = candidates.sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]

  if (!best) {
    return {
      teamNumber: "",
      matchedPilot: "",
      matchStatus: "missing" as const,
      matchScore: 0,
      aliasConfirmed: false,
    }
  }

  const normalizedPilot = normalizeName(pilotName)
  const normalizedBest = normalizeName(best.pilot)

  const exact = normalizedPilot === normalizedBest

  const contained =
    normalizedBest.includes(normalizedPilot) ||
    normalizedPilot.includes(normalizedBest)

  const gap = second ? best.score - second.score : 1

  const isSafeMatch =
    exact ||
    best.score >= 0.96 ||
    (contained && normalizedPilot.length >= 5 && best.score >= 0.90) ||
    (best.score >= 0.88 && gap >= 0.06)

  const isWarningMatch =
    !isSafeMatch &&
    best.score >= 0.65

  return {
    teamNumber: isSafeMatch ? best.teamNumber : "",
    matchedPilot: best.pilot,
    matchStatus: isSafeMatch
      ? ("safe" as const)
      : isWarningMatch
        ? ("warning" as const)
        : ("missing" as const),
    matchScore: best.score,
    aliasConfirmed: isSafeMatch,
  }
}

  function updateTeam(
    id: string,
    field: keyof TeamRow,
    value: string
  ) {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === id ? { ...team, [field]: value } : team
      )
    )
  }

  function removeTeam(id: string) {
    setTeams((prev) => prev.filter((team) => team.id !== id))
  }

  function updateResult(
  posizione: number,
  field: keyof ExtractedRow,
  value: string
) {
  const existingRow = rows.find(
    (row) => row.posizione === posizione
  )

  if (existingRow) {
    setRows((prev) =>
      prev.map((row) =>
        row.posizione === posizione
          ? { ...row, [field]: value }
          : row
      )
    )

    return
  }

  const missingRow = missingRows.find(
    (row) => row.posizione === posizione
  )

  if (!missingRow?.teamNumber) return

  setMissingRowsData((prev) => ({
    ...prev,
    [missingRow.teamNumber as string]: {
      ...prev[missingRow.teamNumber as string],
      [field]: value,
    },
  }))
}

  function updateManualTime(posizione: number, next: ManualTimeParts) {
  setRows((prev) =>
    prev.map((row) =>
      row.posizione === posizione
        ? { ...row, manualTime: next }
        : row
    )
  )
}

  function rematchTeams() {
  setRows((prev) =>
    prev.map((row) => {
      const match = findPilotMatch(row.pilota)

      return {
        ...row,
        ...match,
      }
    })
  )
}

function confirmPilotAlias(
  posizione: number,
  teamNumber: string
) {
  const team = teams.find(
    (item) => item.numeroTeam === teamNumber
  )

  if (!team) return

  const officialPilot = getPilotForSelectedLobby(team)

  setRows((prev) =>
    prev.map((row) =>
      row.posizione === posizione
        ? {
            ...row,
            teamNumber: team.numeroTeam,
            matchedPilot: officialPilot,
            matchStatus: "safe",
            matchScore: 1,
            aliasConfirmed: true,
          }
        : row
    )
  )
}

const expectedLobbyPilots = useMemo(() => {
  return teams
    .map((team) => {
      const pilot = getPilotForSelectedLobby(team)

      return {
        teamNumber: team.numeroTeam,
        teamName: team.nomeTeam,
        pilot,
      }
    })
    .filter((item) => item.pilot)
}, [teams, selectedLobby])

const missingRows = useMemo<ExtractedRow[]>(() => {
  const confirmedTeams = new Set(
    rows
      .filter(
        (row) =>
          row.teamNumber &&
          row.matchStatus === "safe"
      )
      .map((row) => row.teamNumber)
  )

  const missingPilots = expectedLobbyPilots.filter(
    (pilot) => !confirmedTeams.has(pilot.teamNumber)
  )

  const startPosition = rows.length + 1

  return missingPilots.map((pilot, index) => {
  const savedData =
    missingRowsData[pilot.teamNumber] || {}

  return {
    posizione: startPosition + index,

    pilota: pilot.pilot,

    officialPilot: pilot.pilot,

    teamNumber: pilot.teamNumber,

    matchStatus: "safe",

    aliasConfirmed: true,

    isMissingFromResult: true,

    pvcpEnabled: true,

    pvcpCrashLap:
      savedData.pvcpCrashLap || "",

    pvcpRacePosition:
  savedData.pvcpRacePosition || "",

    pvcpFrontTeam:
      savedData.pvcpFrontTeam || "",

    pvcpBackTeam:
      savedData.pvcpBackTeam || "",

    pvcpCalculatedGap:
      savedData.pvcpCalculatedGap || "",

    distacco: "",

    tempoTotale: "",
  }
})
}, [rows, expectedLobbyPilots, missingRowsData])

const rowsWithCalculatedGap = useMemo<ExtractedRow[]>(() => {
  const allRows = [
    ...rows,
    ...missingRows,
  ]
  const winner = allRows.find(
  (row) => row.posizione === 1
)

  if (!winner) return allRows

  return allRows.map((row) => {
    const manualTotalTime = manualTimePartsToFullTime(row.manualTime)

    const calculatedGap = row.lapsDown
      ? calculateLappedGap(
          manualTotalTime,
          row.lapsDown,
          winner.fastestLap || "",
          winner.tempoTotale || "",
          lappedCorrectionSeconds
        )
      : ""

    const frontRow = rows.find(
      (item) => item.teamNumber === row.pvcpFrontTeam
    )

    const backRow = rows.find(
      (item) => item.teamNumber === row.pvcpBackTeam
    )

    const pvcpCalculatedGap = row.pvcpEnabled
  ? calculatePvcpGap(
      Number(row.pvcpCrashLap),
      Number(row.pvcpRacePosition),
      getRowTotalTime(frontRow, winner.tempoTotale || ""),
      getRowTotalTime(backRow, winner.tempoTotale || ""),
      winner.tempoTotale || "",
      rows.length
    )
  : ""

    return {
      ...row,
      calculatedGap,
      pvcpCalculatedGap,
    }
  })
}, [rows, lappedCorrectionSeconds])

const hasUnconfirmedAliases = rows.some(
  (row) =>
    row.matchStatus === "warning" ||
    row.matchStatus === "missing"
)

const hasIncompletePvcp = rowsWithCalculatedGap.some(
  (row) =>
    row.pvcpEnabled &&
    (
      !row.pvcpCrashLap ||
      !row.pvcpRacePosition ||
      !row.pvcpCalculatedGap
    )
)

const raceControlBlocked =
  hasUnconfirmedAliases ||
  hasIncompletePvcp

const releaseGrid = useMemo<ReleaseRow[]>(() => {
  const map = new Map<string, ReleaseRow>()

  for (const row of rowsWithCalculatedGap) {
    const teamNumber = (row.teamNumber || "").trim()
    if (!teamNumber) continue

    const team = teams.find((t) => t.numeroTeam === teamNumber)
    const existing = map.get(teamNumber)

    if (!existing || row.posizione < existing.position) {
      map.set(teamNumber, {
        teamNumber,
        teamName: team?.nomeTeam || "",
        position: row.posizione,
        pilot: row.pilota,
        releaseTime:
  row.posizione === 1
    ? "00:00.000"
    : row.pvcpCalculatedGap ||
      row.calculatedGap ||
      formatTimer(parseReleaseTimeToMs(row.distacco)),
      })
    }
  }

  return Array.from(map.values()).sort(
  (a, b) =>
    parseReleaseTimeToMs(a.releaseTime) -
    parseReleaseTimeToMs(b.releaseTime)
)
}, [rowsWithCalculatedGap, teams])

async function handleExtract() {
    if (!files.length) {
      setError("Carica almeno uno screen gara.")
      return
    }

    setLoading(true)
    setError("")
    setRows([])
    setDebugText("")

    try {
      const fd = new FormData()
      files.forEach((file) => fd.append("files", file))

      const res = await fetch("/api/extract", {
        method: "POST",
        body: fd,
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data.error || "Errore estrazione")
        setDebugText(data.debugText || JSON.stringify(data, null, 2))
        return
      }

      const extractedRows: ExtractedRow[] = data.rows || []

      const rowsWithTeams = extractedRows.map((row) => {
  const match = findPilotMatch(row.pilota)

  return {
    ...row,
    ...match,
  }
})

      setRows(rowsWithTeams)

setDebugText(
  (data.debugText || "") +
  "\n\n====================\n\nROWS:\n\n" +
  JSON.stringify(rowsWithTeams, null, 2)
)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-4xl font-black mb-2">
        PRT Endurance Control
      </h1>

      <p className="text-zinc-400 mb-8">
        Upload screen gara GT7 P1-P8 e P9-P14.
      </p>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
        <h2 className="text-xl font-bold mb-4">1. Gestione Team</h2>

        <button
          onClick={() => setTeams((prev) => [...prev, createEmptyTeam()])}
          className="mb-4 rounded-xl bg-white px-4 py-2 font-black text-black"
        >
          + Aggiungi Team
        </button>

        {!teams.length ? (
          <p className="text-zinc-500">Nessun team inserito.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="border-b border-white/10 p-2">Numero Team</th>
                <th className="border-b border-white/10 p-2">Nome Team</th>
                <th className="border-b border-white/10 p-2">Pilota Lobby 1</th>
                <th className="border-b border-white/10 p-2">Pilota Lobby 2</th>
                <th className="border-b border-white/10 p-2">Pilota Lobby 3</th>
                <th className="border-b border-white/10 p-2"></th>
              </tr>
            </thead>

            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td className="border-b border-white/5 p-2">
                    <input
                      value={team.numeroTeam}
                      onChange={(e) =>
                        updateTeam(team.id, "numeroTeam", e.target.value)
                      }
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={team.nomeTeam}
                      onChange={(e) =>
                        updateTeam(team.id, "nomeTeam", e.target.value)
                      }
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={team.pilotaLobby1}
                      onChange={(e) =>
                        updateTeam(team.id, "pilotaLobby1", e.target.value)
                      }
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={team.pilotaLobby2}
                      onChange={(e) =>
                        updateTeam(team.id, "pilotaLobby2", e.target.value)
                      }
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={team.pilotaLobby3}
                      onChange={(e) =>
                        updateTeam(team.id, "pilotaLobby3", e.target.value)
                      }
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <button
                      onClick={() => removeTeam(team.id)}
                      className="rounded-lg bg-red-500/20 px-3 py-1 text-red-200"
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
  <h2 className="text-xl font-bold mb-4">
    Lobby da elaborare
  </h2>

  <div className="flex flex-wrap gap-3">
    {([1, 2, 3] as const).map((lobby) => (
      <button
        key={lobby}
        type="button"
        onClick={() => setSelectedLobby(lobby)}
        className={
          selectedLobby === lobby
            ? "rounded-xl bg-yellow-400 px-5 py-3 font-black text-black"
            : "rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-zinc-300 hover:bg-white/10"
        }
      >
        Lobby {lobby}
      </button>
    ))}
  </div>

  <div className="mt-4 text-sm text-zinc-400">
    Verranno utilizzati esclusivamente i piloti registrati in{" "}
    <span className="font-black text-yellow-300">
      Lobby {selectedLobby}
    </span>
  </div>
</section>
      
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
  <h2 className="text-xl font-bold mb-4">
    Correttivo doppiati
  </h2>

  <div className="flex items-center gap-3">
    <span className="text-zinc-300">
      Secondi da aggiungere al giro del vincitore:
    </span>

    <input
      value={lappedCorrectionSeconds}
      onChange={(e) => setLappedCorrectionSeconds(e.target.value)}
      className="w-24 rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono"
    />

    <span className="text-zinc-500">s</span>
  </div>
</section>
      
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
        <h2 className="text-xl font-bold mb-4">2. Upload screen gara</h2>

        <label
  htmlFor="race-upload"
  className="
    flex cursor-pointer flex-col items-center justify-center
    rounded-2xl border-2 border-dashed border-yellow-400/60
    bg-yellow-400/10
    px-8 py-10
    text-center
    transition
    hover:bg-yellow-400/20
    hover:border-yellow-300
  "
>
  <div className="text-3xl font-black text-yellow-300">
    📸 SCEGLI SCREEN GARA
  </div>

  <div className="mt-2 text-zinc-300">
    Clicca qui e seleziona gli screen GT7
  </div>

  <div className="mt-4 text-sm font-bold">
    {files.length === 0
      ? "Nessun file selezionato"
      : `✅ ${files.length} file selezionat${files.length === 1 ? "o" : "i"}`}
  </div>
</label>

<input
  id="race-upload"
  type="file"
  accept="image/*"
  multiple
  className="hidden"
  onChange={(e) => {
    const selected = Array.from(e.target.files || [])
    setFiles(selected)
  }}
/>
        <button
          onClick={handleExtract}
          disabled={loading}
          className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 font-black text-black disabled:opacity-50"
        >
          {loading ? "OCR in corso..." : "Estrai risultati gara"}
        </button>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
        <h2 className="text-xl font-bold mb-4">3. Risultati estratti</h2>
        <button
  onClick={rematchTeams}
  className="mb-4 rounded-xl bg-sky-500 px-4 py-2 font-black text-black"
>
  Ricalcola Team
</button>

        {!rows.length ? (
          <p className="text-zinc-500">Nessun risultato ancora.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="border-b border-white/10 p-2">Pos</th>
                <th className="border-b border-white/10 p-2">Team</th>
                <th className="border-b border-white/10 p-2">Pilota</th>
                <th className="border-b border-white/10 p-2">Distacco</th>
                <th className="border-b border-white/10 p-2">Tempo leader</th>
<th className="border-b border-white/10 p-2">GV</th>
<th className="border-b border-white/10 p-2">Casi speciali DG</th>
<th className="border-b border-white/10 p-2">Dati richiesti</th>
<th className="border-b border-white/10 p-2">Gap calcolato</th>
              </tr>
            </thead>

            <tbody>
              {rowsWithCalculatedGap.map((row) => (
                <tr key={row.posizione}>
                  <td className="border-b border-white/5 p-2 font-mono">
                    {row.posizione}
                  </td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={row.teamNumber || ""}
                      onChange={(e) =>
                        updateResult(
                          row.posizione,
                          "teamNumber",
                          e.target.value
                        )
                      }
                      className="w-20 rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
  <input
    value={row.pilota}
    onChange={(e) =>
      updateResult(row.posizione, "pilota", e.target.value)
    }
    className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1"
  />

  {row.isMissingFromResult ? (
    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-black text-red-200">
      ⚠ ASSENTE DAL RISULTATO
    </div>
  ) : null}

  {row.matchStatus === "safe" && !row.isMissingFromResult ? (
    <div className="mt-2 text-xs font-bold text-emerald-300">
      ✓ Associato a {row.matchedPilot}
    </div>
  ) : null}

  {row.matchStatus === "warning" ? (
  <div className="mt-2 rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-2 text-xs text-yellow-200">
    <div className="font-black">
      ⚠ Alias da confermare
    </div>

    <div className="mt-1">
      Nome letto OCR:{" "}
      <span className="font-black">{row.pilota}</span>
    </div>

    <div className="mt-1">
      Migliore candidato:{" "}
      <span className="font-black">
        {row.matchedPilot || "Nessun candidato"}
      </span>
    </div>

    <select
      value=""
      onChange={(e) => {
        if (!e.target.value) return

        confirmPilotAlias(
          row.posizione,
          e.target.value
        )
      }}
      className="mt-2 w-full rounded-lg border border-yellow-400/30 bg-zinc-900 px-2 py-2 text-white"
    >
      <option value="">
        Seleziona il pilota corretto
      </option>

      {teams
        .map((team) => {
          const pilot = getPilotForSelectedLobby(team)

          return {
            teamNumber: team.numeroTeam,
            teamName: team.nomeTeam,
            pilot,
          }
        })
        .filter((item) => item.pilot)
        .map((item) => (
          <option
            key={`alias-${row.posizione}-${item.teamNumber}`}
            value={item.teamNumber}
          >
            Team {item.teamNumber} — {item.pilot}
            {item.teamName ? ` — ${item.teamName}` : ""}
          </option>
        ))}
    </select>
  </div>
) : null}

  {row.matchStatus === "missing" ? (
  <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
    <div className="font-black">
      ⚠ Nessun pilota associato
    </div>

    <div className="mt-1">
      Nome letto OCR:{" "}
      <span className="font-black">{row.pilota}</span>
    </div>

    <select
      value=""
      onChange={(e) => {
        if (!e.target.value) return

        confirmPilotAlias(
          row.posizione,
          e.target.value
        )
      }}
      className="mt-2 w-full rounded-lg border border-red-500/30 bg-zinc-900 px-2 py-2 text-white"
    >
      <option value="">
        Indica manualmente chi è
      </option>

      {teams
        .map((team) => {
          const pilot = getPilotForSelectedLobby(team)

          return {
            teamNumber: team.numeroTeam,
            teamName: team.nomeTeam,
            pilot,
          }
        })
        .filter((item) => item.pilot)
        .map((item) => (
          <option
            key={`missing-${row.posizione}-${item.teamNumber}`}
            value={item.teamNumber}
          >
            Team {item.teamNumber} — {item.pilot}
            {item.teamName ? ` — ${item.teamName}` : ""}
          </option>
        ))}
    </select>
  </div>
) : null}
</td>

                  <td className="border-b border-white/5 p-2">
                    <input
                      value={row.distacco}
                      onChange={(e) =>
                        updateResult(row.posizione, "distacco", e.target.value)
                      }
                      className="w-32 rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono"
                    />
                  </td>

                  <td className="border-b border-white/5 p-2">
  <input
    value={row.tempoTotale}
    onChange={(e) =>
      updateResult(row.posizione, "tempoTotale", e.target.value)
    }
    className="w-36 rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono"
  />
</td>

<td className="border-b border-white/5 p-2 font-mono">
  {row.fastestLap || "-"}
</td>

<td className="border-b border-white/5 p-2">
  <div className="flex min-w-36 flex-col gap-2">
    {row.lapsDown ? (
      <div className="font-mono font-bold text-yellow-300">
        {row.lapsDown} giro{row.lapsDown > 1 ? "i" : ""}
      </div>
    ) : null}

    {!row.lapsDown ? (
  <button
    type="button"
    onClick={() =>
      setRows((prev) =>
        prev.map((item) =>
          item.posizione === row.posizione
            ? {
                ...item,
                pvcpEnabled: !item.pvcpEnabled,
                pvcpCrashLap: "",
                pvcpRacePosition: "",
                pvcpFrontTeam: "",
                pvcpBackTeam: "",
              }
            : item
        )
      )
    }
    className={
      row.pvcpEnabled
        ? "rounded-lg bg-red-500 px-3 py-1 text-xs font-black text-white"
        : "rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-zinc-400 hover:bg-white/10"
    }
  >
    {row.pvcpEnabled ? "PVCP ATTIVO" : "+ CASO PVCP"}
  </button>
) : null}

    {!row.lapsDown && !row.pvcpEnabled ? (
      <span className="text-xs text-zinc-600">Nessun intervento</span>
    ) : null}
  </div>
</td>

<td className="border-b border-white/5 p-2">
  {row.lapsDown ? (
    <LappedTimeInput
      value={row.manualTime}
      onChange={(next) => {
        setRows((prev) =>
          prev.map((item) =>
            item.posizione === row.posizione
              ? { ...item, manualTime: next }
              : item
          )
        )
      }}
    />
  ) : row.pvcpEnabled ? (
    <div className="min-w-[300px]">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="1"
          max={TOTAL_RACE_LAPS}
          placeholder="Giro crash"
          value={row.pvcpCrashLap || ""}
          onChange={(e) =>
            updateResult(row.posizione, "pvcpCrashLap", e.target.value)
          }
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 font-mono"
        />

        <input
          type="number"
          min="1"
          placeholder="Posizione crash"
          value={row.pvcpRacePosition || ""}
          onChange={(e) =>
            updateResult(row.posizione, "pvcpRacePosition", e.target.value)
          }
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 font-mono"
        />

        <select
          value={row.pvcpFrontTeam || ""}
          onChange={(e) =>
            updateResult(row.posizione, "pvcpFrontTeam", e.target.value)
          }
          className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1"
        >
          <option value="">Team davanti</option>

          {rows
            .filter((item) => item.posizione !== row.posizione)
            .map((item) => (
              <option
                key={`front-${item.posizione}`}
                value={item.teamNumber || ""}
              >
                Team {item.teamNumber || "?"} — P{item.posizione}
              </option>
            ))}
        </select>

        <select
          value={row.pvcpBackTeam || ""}
          onChange={(e) =>
            updateResult(row.posizione, "pvcpBackTeam", e.target.value)
          }
          className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1"
        >
          <option value="">Team dietro</option>

          {rows
            .filter((item) => item.posizione !== row.posizione)
            .map((item) => (
              <option
                key={`back-${item.posizione}`}
                value={item.teamNumber || ""}
              >
                Team {item.teamNumber || "?"} — P{item.posizione}
              </option>
            ))}
        </select>
      </div>

      {getPvcpDetails(row.pvcpCrashLap) ? (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs">
          <div>
            Settore:{" "}
            <span className="font-black">
              {getPvcpDetails(row.pvcpCrashLap)?.sector}
            </span>
          </div>

          <div>
            Giri mancanti:{" "}
            <span className="font-black">
              {getPvcpDetails(row.pvcpCrashLap)?.missingLaps}
            </span>
          </div>

          <div>
            Recovery Index:{" "}
            <span className="font-black">
              {getPvcpDetails(row.pvcpCrashLap)?.recoveryIndexSeconds} s/giro
            </span>
          </div>

          <div>
            Base Crash Offset:{" "}
            <span className="font-black">
              +{getPvcpDetails(row.pvcpCrashLap)?.baseCrashOffsetSeconds} s
            </span>
          </div>
        </div>
      ) : null}
    </div>
  ) : (
    <span className="text-zinc-600">-</span>
  )}
</td>

<td className="border-b border-white/5 p-2 font-mono text-xs">
  {row.lapsDown ? (
    <>
      <div>Manual: {manualTimePartsToFullTime(row.manualTime)}</div>
      <div>Gap doppiato: {row.calculatedGap || "-"}</div>
    </>
  ) : row.pvcpEnabled ? (
    <div className="font-bold text-red-300">
      Gap PVCP: {row.pvcpCalculatedGap || "-"}
    </div>
  ) : (
    <span className="text-zinc-600">-</span>
  )}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
  <h2 className="text-xl font-bold mb-4">
    4. Griglia rilascio lobby successiva
  </h2>

  {!releaseGrid.length ? (
    <p className="text-zinc-500">
      Nessun Team riconosciuto nei risultati.
    </p>
  ) : (
    <>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="border-b border-white/10 p-2">Ordine rilascio</th>
            <th className="border-b border-white/10 p-2">Team</th>
            <th className="border-b border-white/10 p-2">Nome Team</th>
            <th className="border-b border-white/10 p-2">Pilota rilevato</th>
            <th className="border-b border-white/10 p-2">Pos. arrivo</th>
            <th className="border-b border-white/10 p-2">Rilascio</th>
          </tr>
        </thead>

        <tbody>
          {releaseGrid.map((team, index) => (
            <tr key={team.teamNumber}>
              <td className="border-b border-white/5 p-2 font-mono">
                {index + 1}
              </td>

              <td className="border-b border-white/5 p-2 font-mono font-black">
                {team.teamNumber}
              </td>

              <td className="border-b border-white/5 p-2">
                {team.teamName || "-"}
              </td>

              <td className="border-b border-white/5 p-2">
                {team.pilot}
              </td>

              <td className="border-b border-white/5 p-2 font-mono">
                P{team.position}
              </td>

              <td className="border-b border-white/5 p-2 font-mono font-black">
                {team.releaseTime}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {raceControlBlocked ? (
  <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
    <div className="font-black">
      ⚠ Race Control non disponibile
    </div>

    {hasUnconfirmedAliases ? (
      <div className="mt-2 text-sm">
        Conferma tutti gli alias ancora dubbi o non associati.
      </div>
    ) : null}

    {hasIncompletePvcp ? (
      <div className="mt-2 text-sm">
        Completa tutti i dati PVCP e verifica che il gap sia stato calcolato.
      </div>
    ) : null}
  </div>
) : (
  <button
    onClick={() => {
      localStorage.setItem(
        "prt-endurance-release-grid",
        JSON.stringify(releaseGrid)
      )
      window.location.href = "/race-control"
    }}
    className="mt-6 rounded-xl bg-emerald-500 px-5 py-3 font-black text-black"
  >
    🚦 Avvia Race Control
  </button>
)}
    </>
  )}
</section>

<details className="rounded-2xl border border-white/10 bg-black/40 p-5">
  <summary className="cursor-pointer font-bold">
    Debug OCR
  </summary>

  <pre className="mt-4 whitespace-pre-wrap text-xs text-zinc-400">
    {debugText || "Nessun debug disponibile."}
  </pre>
</details>
</main>
)
}