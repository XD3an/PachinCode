# PachinCode's sound player for Windows terminals, where Claude Code plays no clips itself.
# Watches a queue file of "<seq> <name>" lines and plays sounds\<name>.wav for each new one.
# Exits on its own once the queue file is gone, or when the plugin that started it unloads.
param(
  [Parameter(Mandatory = $true)][string]$Queue,
  [Parameter(Mandatory = $true)][string]$Sounds
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

# A few players per clip, so quick repeats (pins, the gate) overlap instead of cutting off.
$pools = @{}
$next = @{}
Get-ChildItem -Path $Sounds -Filter '*.wav' | ForEach-Object {
  $count = if ($_.BaseName -in @('pin', 'launch', 'gate', 'grant')) { 6 } else { 2 }
  $players = @()
  for ($i = 0; $i -lt $count; $i++) {
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([Uri]$_.FullName)
    # Kept quiet: a background murmur, with the big moments only a little louder than the rest.
    $player.Volume = if ($_.BaseName -in @('jackpot', 'kakuhen', 'reach', 'boot')) { 0.2 } else { 0.25 }
    $players += $player
  }
  $pools[$_.BaseName] = $players
  $next[$_.BaseName] = 0
}

$last = -1
if (Test-Path $Queue) {
  # Start after whatever was already queued.
  foreach ($line in (Get-Content -LiteralPath $Queue)) {
    $parts = $line.Split(' ')
    if ($parts.Count -eq 2) { $last = [Math]::Max($last, [long]$parts[0]) }
  }
}

while ($true) {
  if (-not (Test-Path $Queue)) { break }
  try { $lines = Get-Content -LiteralPath $Queue -ErrorAction Stop } catch { $lines = @() }
  foreach ($line in $lines) {
    $parts = "$line".Split(' ')
    if ($parts.Count -ne 2) { continue }
    $seq = [long]$parts[0]
    $name = $parts[1]
    if ($seq -le $last) { continue }
    $last = $seq
    if ($name -eq 'quit') { exit 0 }
    $pool = $pools[$name]
    if ($null -eq $pool) { continue }
    $player = $pool[$next[$name]]
    $next[$name] = ($next[$name] + 1) % $pool.Count
    $player.Stop()
    $player.Position = [TimeSpan]::Zero
    $player.Play()
  }
  # Seq numbers restart when the plugin reloads: follow them down.
  if ($lines.Count -gt 0) {
    $top = ("$($lines[-1])".Split(' '))[0] -as [long]
    if ($null -ne $top -and $top -lt $last - 1000) { $last = $top }
  }
  Start-Sleep -Milliseconds 15
}
