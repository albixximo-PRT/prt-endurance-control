import { NextRequest } from "next/server"
import sharp from "sharp"

export const runtime = "nodejs"

const OCR_PRO_ENDPOINTS = [
  "https://apipro1.ocr.space/parse/image",
  "https://apipro2.ocr.space/parse/image",
] as const

type OcrServerLabel = "API PRO 1" | "API PRO 2" | "UNKNOWN"

function endpointToServerLabel(endpoint: string): OcrServerLabel {
  if (endpoint.includes("apipro1")) return "API PRO 1"
  if (endpoint.includes("apipro2")) return "API PRO 2"
  return "UNKNOWN"
}

function normalizeErrorMessage(x: any) {
  if (!x) return ""
  if (Array.isArray(x)) return x.join(" | ")
  if (typeof x === "string") return x
  return JSON.stringify(x)
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)

  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

async function callOcrSpace(apiKey: string, jpegBuffer: Buffer, engine: "1" | "2") {
  const errors: string[] = []

  for (const endpoint of OCR_PRO_ENDPOINTS) {
    const serverUsed = endpointToServerLabel(endpoint)

    try {
      const fd = new FormData()
      fd.append("apikey", apiKey)
      fd.append("language", "eng")
      fd.append("OCREngine", engine)
      fd.append("scale", "false")
      fd.append("isTable", "false")
      fd.append(
        "file",
        new Blob([new Uint8Array(jpegBuffer)], { type: "image/jpeg" }),
        "gt7.jpg"
      )

      const res = await fetchWithTimeout(endpoint, { method: "POST", body: fd }, 60000)
      const data = await res.json().catch(() => ({}))

      if (!res.ok || data?.IsErroredOnProcessing) {
        const errMsg = normalizeErrorMessage(data?.ErrorMessage)
        errors.push(`${endpoint} -> ${errMsg || `HTTP ${res.status}`}`)
        continue
      }

      return { ok: true as const, data, endpointUsed: endpoint, serverUsed }
    } catch (err: any) {
      errors.push(`${endpoint} -> ${err?.message || String(err)}`)
    }
  }

  return {
    ok: false as const,
    data: {
      IsErroredOnProcessing: true,
      ErrorMessage: `OCR PRO fallita: ${errors.join(" || ")}`,
    },
    endpointUsed: "",
    serverUsed: "UNKNOWN" as OcrServerLabel,
  }
}

async function ocrWithRetry(apiKey: string, prepped: Buffer) {
  let first = await callOcrSpace(apiKey, prepped, "2")
  let { data, endpointUsed, serverUsed } = first

  const err1 = normalizeErrorMessage(data?.ErrorMessage)
  const bad1 = !first.ok || data?.IsErroredOnProcessing
  const retry1 =
    err1.includes("E500") ||
    err1.includes("E101") ||
    err1.toLowerCase().includes("resource") ||
    err1.toLowerCase().includes("timed")

  if (bad1 && retry1) {
    const second = await callOcrSpace(apiKey, prepped, "2")
    ;({ data, endpointUsed, serverUsed } = second)

    const err2 = normalizeErrorMessage(data?.ErrorMessage)
    const bad2 = !second.ok || data?.IsErroredOnProcessing
    const retry2 =
      err2.includes("E500") ||
      err2.includes("E101") ||
      err2.toLowerCase().includes("resource") ||
      err2.toLowerCase().includes("timed")

    if (bad2 && retry2) {
      const third = await callOcrSpace(apiKey, prepped, "1")
      ;({ data, endpointUsed, serverUsed } = third)

      if (!third.ok || data?.IsErroredOnProcessing) {
        return { ok: false as const, text: "", data, endpointUsed, serverUsed }
      }
    }
  } else if (!first.ok || data?.IsErroredOnProcessing) {
    return { ok: false as const, text: "", data, endpointUsed, serverUsed }
  }

  const text: string = data?.ParsedResults?.[0]?.ParsedText || ""

  return {
    ok: true as const,
    text,
    data,
    endpointUsed,
    serverUsed,
  }
}

async function preprocessForOcr(input: Buffer) {
  const img = sharp(input)
  const meta = await img.metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0

  if (!w || !h) {
    return await sharp(input)
      .resize({ width: 1100, withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: 65 })
      .toBuffer()
  }

  const left = Math.round(w * 0.04)
  const right = Math.round(w * 0.04)
  const top = Math.round(h * 0.10)
  const bottom = Math.round(h * 0.12)

  const cropW = Math.max(1, w - left - right)
  const cropH = Math.max(1, h - top - bottom)

  return await sharp(input)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: 1100, withoutEnlargement: true })
    .grayscale()
    .sharpen()
    .jpeg({ quality: 65 })
    .toBuffer()
}

function normalizePilot(s: string) {
  return String(s || "")
    .replace(/\?/g, "7")
    .replace(/_0I\b/g, "_01")
    .replace(/\bPRT[-_]?timmycice\b/gi, "PRT-timmycicc")
    .replace(/\bptroso\b/gi, "ptrbso")
    .replace(/\bneapolis_100\b/gi, "neapolis100")
    .replace(/\bSamueLx\b/gi, "xSamueLx")
    .replace(/\bGabo_Casper85\b/gi, "GaboCasper85")
    .replace(/\bSenpai__ZeN_\b/gi, "Senpai_ZeN_")
    .replace(/\bM__Apex\b/gi, "M_ApeX_")
    .replace(/\bGrollo_?78\b/gi, "Grollo78")
    .replace(/\bZzic3Fr0St--\b/gi, "ZzIc3Fr0St-_-")
    .replace(/\bmani\b/gi, "Grollo78")
    .trim()
}

function normalizeCarLoose(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function looksLikeKnownCarToken(s: string) {
  const t = normalizeCarLoose(s)
  if (!t) return false

  return (
    t.includes("f3500-b") ||
    t.includes("gr.4") ||
    t.includes("gr4") ||
    t.includes("gt4") ||
    t.includes("gt3") ||
    t.includes("racing concept") ||
    t.includes("hypercar") ||
    t.includes("lmdh") ||
    t.includes("lmh") ||
    t.includes("963") ||
    t.includes("499p") ||
    t.includes("9x8") ||
    t.includes("m hybrid")
  )
}

function normalizeTimeText(s: string) {
  return String(s || "")
    .replace(/[,\u066B]/g, ".")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .trim()
}

function normalizeGapText(s: string) {
  return normalizeTimeText(s)
    .replace(/^\+\./, "+0.")
    .replace(/^\+(\d)\.(\d{3})$/, "+$1.$2")
}

type RaceRow = {
  pos: number
  pilota: string
  tempoTotale: string
  distacco: string
  fastestLap: string
  lapsDown: number
}

function takeBlock(lines: string[], headerIdx: number, stopRe: RegExp, n: number) {
  if (headerIdx === -1) return [] as string[]
  const out: string[] = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const s = lines[i].trim()
    if (!s) continue
    if (stopRe.test(s)) break
    out.push(s)
    if (out.length >= n) break
  }

  return out
}

function parseGaraFromColumnText(rawText: string): RaceRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const startCandidates = [1, 9]
  let startIndex = -1
  let startNum = 0

  for (const s of startCandidates) {
    const idx = lines.findIndex((l) => l === String(s))
    if (idx !== -1) {
      startIndex = idx
      startNum = s
      break
    }
  }

  if (startIndex === -1) return []

  const positions: number[] = []
  let cursor = startIndex
  let expected = startNum

  while (cursor < lines.length) {
    if (lines[cursor] === String(expected)) {
      positions.push(expected)
      expected++
      cursor++
      if (positions.length >= 16) break
      continue
    }

    if (/TEMPO|PENALIT|MIGLIOR\s+GIRO/i.test(lines[cursor])) break

    cursor++
    if (positions.length > 0 && cursor - startIndex > 80) break
  }

  if (!positions.length) return []

  const lastPos = positions[positions.length - 1]
  const lastPosIdx = lines.findIndex((l, i) => i >= startIndex && l === String(lastPos))
  cursor = lastPosIdx === -1 ? startIndex : lastPosIdx + 1

  const n = positions.length

  const idxTempo = lines.findIndex((l) => /^TEMPO$/i.test(l) || /TEMPO/i.test(l))
  const idxBest = lines.findIndex((l) => /MIGLIOR\s+GIRO/i.test(l))
  const bestLapRaw = takeBlock(
  lines,
  idxBest,
  /^$/,
  n
)
  const stopAnyHeader = /^(TEMPO|PENALITÀ|PENALITA|MIGLIOR\s+GIRO)$/i

  const isName = (s: string) => {
    const t = String(s || "").trim()

    if (!t) return false
    if (/^\d+$/.test(t)) return false
    if (stopAnyHeader.test(t)) return false
    if (t.includes(":")) return false
    if (/^\+/.test(t)) return false
    if (/^[\-\.\s]+$/.test(t)) return false
    if (looksLikeKnownCarToken(t)) return false
    if (/\(\d{3}\)/.test(t)) return false
    if (/'\d{2}\b/.test(t)) return false

    return /[A-Za-z]/.test(t)
  }

  const names: string[] = []

  while (cursor < lines.length && names.length < n) {
    const s = lines[cursor]
    if (isName(s)) names.push(normalizePilot(s.replace(/\s+/g, "_")))
    cursor++
    if (idxTempo !== -1 && cursor >= idxTempo) break
  }

  while (names.length < n) names.push("")

  const tempoRaw = takeBlock(
    lines,
    idxTempo,
    /^(PENALITÀ|PENALITA|MIGLIOR\s+GIRO)$/i,
    n
  )

  const out: RaceRow[] = []

  for (let i = 0; i < n; i++) {
    const pos = positions[i]
    const pilota = names[i] ?? ""
    const tempoCell = normalizeTimeText((tempoRaw[i] ?? "").trim())
    const fastestLap = normalizeTimeText((bestLapRaw[i] ?? "").trim())

    let tempoTotale = ""
    let distacco = ""
    let lapsDown = 0

    if (pos === 1) {
      if (/^(?:\d+:)?\d{1,2}:\d{2}\.\d{3}$/.test(tempoCell)) {
        tempoTotale = tempoCell
      }
      distacco = "0.000"
    } else {
      if (tempoCell.startsWith("+")) {
        distacco = normalizeGapText(tempoCell)
      } else if (/in\s+gara/i.test(tempoCell)) {
        distacco = "BOX"
      } else {
        const giroMatch =
          tempoCell.match(/^(\d+)\s*giro/i) ||
          tempoCell.match(/^(\d+)\s*giri/i)

        if (giroMatch) {
  lapsDown = Number(giroMatch[1])
  distacco = `${giroMatch[1]}giro`
}
        else if (/non\s*finito/i.test(tempoCell)) distacco = "DNF"
        else distacco = tempoCell
      }
    }

    out.push({
  pos,
  pilota,
  tempoTotale,
  distacco,
  fastestLap,
  lapsDown,
})
  }

  return out
}

function classifyText(text: string): "race" | "unknown" {
  const t = (text || "").toUpperCase()
  const isRace =
    t.includes("TEMPO") &&
    (t.includes("PENALIT") || t.includes("PENALITA")) &&
    t.includes("MIGLIOR GIRO")

  if (isRace) return "race"
  if (t.includes("PENALIT") || t.includes("NON FINITO") || t.includes("IN GARA")) {
    return "race"
  }

  return "unknown"
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll("files").filter(Boolean) as File[]

    if (!files.length) {
      return Response.json({ ok: false, error: "Nessun file ricevuto" }, { status: 400 })
    }

    const apiKey = process.env.OCR_SPACE_API_KEY

    if (!apiKey) {
      return Response.json(
        { ok: false, error: "Manca OCR_SPACE_API_KEY in .env.local" },
        { status: 500 }
      )
    }

    const rowsByPos = new Map<number, RaceRow>()
    const debugTexts: string[] = []

    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx]
      const input = Buffer.from(await f.arrayBuffer())
      const prepped = await preprocessForOcr(input)

      const ocr = await ocrWithRetry(apiKey, prepped)

      if (!ocr.ok) {
        return Response.json(
          {
            ok: false,
            error: "OCR.space error",
            ocrStatus: {
              IsErroredOnProcessing: ocr.data?.IsErroredOnProcessing,
              ErrorMessage: ocr.data?.ErrorMessage,
              ErrorDetails: ocr.data?.ErrorDetails,
            },
          },
          { status: 502 }
        )
      }

      const text = ocr.text
      debugTexts.push(`FILE #${idx + 1} — ${f.name}\n\n${text}`)

      const kind = classifyText(text)
      const part = kind === "race" ? parseGaraFromColumnText(text) : []

      for (const r of part) {
        rowsByPos.set(r.pos, r)
      }
    }

    const rows = Array.from(rowsByPos.values())
  .sort((a, b) => a.pos - b.pos)
  .map((r) => ({
    posizione: r.pos,
    pilota: r.pilota,
    distacco: r.distacco,
    tempoTotale: r.tempoTotale,
    fastestLap: r.fastestLap,
    lapsDown: r.lapsDown,
  }))

    if (!rows.length) {
      return Response.json(
        {
          ok: false,
          error: "Nessun risultato gara trovato",
          debugText: debugTexts.join("\n\n===== NEXT FILE =====\n\n"),
        },
        { status: 400 }
      )
    }

    return Response.json({
      ok: true,
      count: rows.length,
      rows,
      debugText: debugTexts.join("\n\n===== NEXT FILE =====\n\n"),
    })
  } catch (err: any) {
  console.error("ERRORE API EXTRACT:", err)

  return Response.json(
    {
      ok: false,
      error: "Errore server",
      details: String(err?.stack || err?.message || err),
    },
    { status: 500 }
  )
}
}