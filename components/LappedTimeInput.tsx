"use client"

import { useRef, type KeyboardEvent } from "react"

export type ManualTimeParts = {
  hh: string
  mm: string
  ss: string
  ms: string
}

type LappedTimeInputProps = {
  value?: ManualTimeParts
  onChange: (next: ManualTimeParts) => void
}

export default function LappedTimeInput({
  value,
  onChange,
}: LappedTimeInputProps) {
  const hhRef = useRef<HTMLInputElement | null>(null)
  const mmRef = useRef<HTMLInputElement | null>(null)
  const ssRef = useRef<HTMLInputElement | null>(null)
  const msRef = useRef<HTMLInputElement | null>(null)

  const current = value || {
    hh: "",
    mm: "",
    ss: "",
    ms: "",
  }

  function update(part: keyof ManualTimeParts, raw: string) {
    const clean = raw.replace(/\D/g, "")
    const maxLength = part === "ms" ? 3 : 2
    const sliced = clean.slice(0, maxLength)

    onChange({
      ...current,
      [part]: sliced,
    })

    if (sliced.length === maxLength) {
      if (part === "hh") mmRef.current?.focus()
      if (part === "mm") ssRef.current?.focus()
      if (part === "ss") msRef.current?.focus()
    }
  }

  function handleBackspace(
  e: KeyboardEvent<HTMLInputElement>,
  part: keyof ManualTimeParts
) {
  if (e.key !== "Backspace") return

  if ((current[part] || "").length > 0) return

  if (part === "mm") hhRef.current?.focus()
  if (part === "ss") mmRef.current?.focus()
  if (part === "ms") ssRef.current?.focus()
}

  const inputClass =
    "w-12 rounded-lg bg-black/40 border border-yellow-400/40 px-2 py-1 text-center font-mono"

  return (
    <div className="flex items-center gap-1">
      <input
        ref={hhRef}
        value={current.hh}
        onChange={(e) => update("hh", e.target.value)}
        placeholder="00"
        maxLength={2}
        className={inputClass}
      />

      <span className="text-zinc-500">:</span>

      <input
        ref={mmRef}
        value={current.mm}
        onChange={(e) => update("mm", e.target.value)}
        onKeyDown={(e) => handleBackspace(e, "mm")}
        placeholder="00"
        maxLength={2}
        className={inputClass}
      />

      <span className="text-zinc-500">:</span>

      <input
        ref={ssRef}
        value={current.ss}
        onChange={(e) => update("ss", e.target.value)}
        onKeyDown={(e) => handleBackspace(e, "ss")}
        placeholder="00"
        maxLength={2}
        className={inputClass}
      />

      <span className="text-zinc-500">.</span>

      <input
        ref={msRef}
        value={current.ms}
        onChange={(e) => update("ms", e.target.value)}
        onKeyDown={(e) => handleBackspace(e, "ms")}
        placeholder="000"
        maxLength={3}
        className="w-16 rounded-lg bg-black/40 border border-yellow-400/40 px-2 py-1 text-center font-mono"
      />
    </div>
  )
}