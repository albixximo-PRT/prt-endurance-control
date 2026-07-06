import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const exec = promisify(execFile)

const OUTPUT = path.join(process.cwd(), "public", "audio")

if (!existsSync(OUTPUT)) {
  await mkdir(OUTPUT, { recursive: true })
}

const units = [
  "",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
]

const teens = [
  "dieci",
  "undici",
  "dodici",
  "tredici",
  "quattordici",
  "quindici",
  "sedici",
  "diciassette",
  "diciotto",
  "diciannove",
]

const tens = [
  "",
  "",
  "venti",
  "trenta",
  "quaranta",
  "cinquanta",
  "sessanta",
  "settanta",
  "ottanta",
  "novanta",
]

function numeroItaliano(n) {
  if (n < 10) return units[n]

  if (n < 20) return teens[n - 10]

  const d = Math.floor(n / 10)
  const u = n % 10

  let word = tens[d]

  // regola italiana: ventuno, ventotto...
  if (u === 1 || u === 8)
    word = word.slice(0, -1)

  return word + units[u]
}

for (let i = 1; i <= 99; i++) {

  const text = `Team, ${numeroItaliano(i)}`

  const file = path.join(
    OUTPUT,
    `team-${i}.mp3`
  )

  console.log(`Genero team-${i}.mp3 -> ${text}`)

  await exec(
    "npx.cmd",
    [
      "node-edge-tts",
      "-t",
      text,
      "-f",
      file,
      "-v",
      "it-IT-GiuseppeNeural",
      "-r",
      "+10%",
      "--volume",
      "+200%",
    ]
  )
}

console.log("")
console.log("✅ COMPLETATO")
console.log("99 file creati in public/audio")