Add-Type -AssemblyName System

function Write-WavTone($path, $frequency, $durationMs, $volume) {
  $sampleRate = 44100
  $samples = [int]($sampleRate * $durationMs / 1000)
  $bytes = New-Object byte[] ($samples * 2)

  for ($i = 0; $i -lt $samples; $i++) {
    $t = $i / $sampleRate
    $sample = [math]::Sin(2 * [math]::PI * $frequency * $t)
    $value = [int16]($sample * 32767 * $volume)

    $bytes[$i * 2] = $value -band 0xff
    $bytes[$i * 2 + 1] = ($value -shr 8) -band 0xff
  }

  $dataSize = $bytes.Length
  $fileSize = 36 + $dataSize

  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter($fs)

  $bw.Write([Text.Encoding]::ASCII.GetBytes("RIFF"))
  $bw.Write([int]$fileSize)
  $bw.Write([Text.Encoding]::ASCII.GetBytes("WAVE"))
  $bw.Write([Text.Encoding]::ASCII.GetBytes("fmt "))
  $bw.Write([int]16)
  $bw.Write([int16]1)
  $bw.Write([int16]1)
  $bw.Write([int]$sampleRate)
  $bw.Write([int]($sampleRate * 2))
  $bw.Write([int16]2)
  $bw.Write([int16]16)
  $bw.Write([Text.Encoding]::ASCII.GetBytes("data"))
  $bw.Write([int]$dataSize)
  $bw.Write($bytes)

  $bw.Close()
  $fs.Close()
}

if (!(Test-Path ".\public\system")) {
  New-Item -ItemType Directory -Path ".\public\system" | Out-Null
}

Write-WavTone ".\public\system\tick.wav" 900 90 0.18
Write-WavTone ".\public\system\start.wav" 950 900 0.85

Write-Host "Creati tick.wav e start.wav"