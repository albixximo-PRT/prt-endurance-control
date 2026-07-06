import { writeFileSync, mkdirSync, existsSync } from "node:fs"

const dir = "./public/system"
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

function writeTone(file, frequency, durationMs, volume) {
  const sampleRate = 44100
  const samples = Math.floor(sampleRate * durationMs / 1000)
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * frequency * t)
    const value = Math.max(-1, Math.min(1, sample * volume)) * 32767
    buffer.writeInt16LE(value, 44 + i * 2)
  }

  writeFileSync(file, buffer)
}

writeTone("./public/system/tick.wav", 900, 90, 0.06)
writeTone("./public/system/start.wav", 950, 900, 0.30)

console.log("Creati tick.wav e start.wav")