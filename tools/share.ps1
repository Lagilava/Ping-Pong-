<#
  share.ps1 - put the game online so testers anywhere (PC or phone) can play it.

  Started by "Share Online (PC + Mobile).bat". It:
    1. starts the local game server (serve.ps1) and opens the game here,
    2. opens a free Cloudflare "quick tunnel" to it - no account, no router or
       firewall changes - which gives a public https://....trycloudflare.com link,
    3. shows that link (copied to the clipboard) plus a QR code page for phones.

  The tunnel only exposes the game/ folder through the same read-only server the
  normal launcher uses. The link is random, changes every run, and stops working
  the moment this window is closed.

  cloudflared.exe (Cloudflare's official tunnel client, ~60 MB) is downloaded
  from GitHub into tools\bin on first run, unless it is already installed.

  Parameters
    -Port       preferred local port (default 8080)
    -NoBrowser  don't open the game on this PC
    -NoQr       don't open the QR code page
#>
param(
    [int]$Port = 8080,
    [switch]$NoBrowser,
    [switch]$NoQr
)

$ErrorActionPreference = 'Stop'
$BinDir = Join-Path $PSScriptRoot 'bin'
$WorkDir = Join-Path $env:TEMP 'PingPongNeon-share'
New-Item -ItemType Directory -Force -Path $BinDir, $WorkDir | Out-Null

function Fail([string]$msg) {
    Write-Host ''
    Write-Host "  $msg" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# -- 1. cloudflared ------------------------------------------------------------
function Get-Cloudflared {
    $local = Join-Path $BinDir 'cloudflared.exe'
    if (Test-Path $local) { return $local }
    $onPath = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $arch = 'amd64'
    if ($env:PROCESSOR_ARCHITECTURE -eq 'x86' -and -not $env:PROCESSOR_ARCHITEW6432) { $arch = '386' }
    $src = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
    Write-Host '  First run: downloading cloudflared (Cloudflare tunnel client)...' -ForegroundColor Yellow
    Write-Host "  $src"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $tmp = "$local.download"
    try {
        $ProgressPreference = 'SilentlyContinue'   # the progress bar makes 5.1 downloads crawl
        Invoke-WebRequest -Uri $src -OutFile $tmp -UseBasicParsing
        Move-Item -Force $tmp $local
    } catch {
        Remove-Item -Force $tmp -ErrorAction SilentlyContinue
        Fail "Could not download cloudflared: $($_.Exception.Message)`n  Check the internet connection, or install it yourself (winget install Cloudflare.cloudflared) and run this again."
    }
    return $local
}

# -- QR code page for phones ----------------------------------------------------
function Open-QrPage([string]$link) {
    $enc = [Uri]::EscapeDataString($link)
    $html = @"
<!doctype html><html><head><meta charset="utf-8"><title>Ping Pong Neon - share link</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#05060f;color:#e8f6ff;font:16px system-ui,sans-serif}
.card{text-align:center;padding:32px 40px;border:1px solid #1ff3ff55;border-radius:16px;background:#0b1024;box-shadow:0 0 40px #1ff3ff22}
h1{margin:0 0 6px;font-size:22px;letter-spacing:.08em;color:#1ff3ff}
p{margin:6px 0;color:#9fb3c8}
img{margin:18px 0;background:#fff;padding:12px;border-radius:10px;width:280px;height:280px}
a{display:block;font-size:18px;color:#ff4fd8;word-break:break-all}
</style></head><body><div class="card">
<h1>PING PONG - NEON EDITION</h1>
<p>Scan with a phone camera, or send the link to PC testers.</p>
<img alt="QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=0&data=$enc">
<a href="$link">$link</a>
<p>Works while the share window stays open on the host PC.</p>
</div></body></html>
"@
    $file = Join-Path $WorkDir 'share-link.html'
    Set-Content -Path $file -Value $html -Encoding UTF8
    Start-Process $file
}

# -- Main ------------------------------------------------------------------------
Write-Host ''
Write-Host '  PING PONG - NEON EDITION  /  SHARE ONLINE' -ForegroundColor Cyan
Write-Host ''

$cloudflared = Get-Cloudflared

# Local game server, sharing this console so closing the window stops it too.
$portFile = Join-Path $WorkDir 'port.txt'
$serverLog = Join-Path $WorkDir 'server.log'
Remove-Item -Force $portFile -ErrorAction SilentlyContinue
$serveArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'serve.ps1')`"",
               '-Port', $Port, '-PortFile', "`"$portFile`"")
if ($NoBrowser) { $serveArgs += '-NoBrowser' }
$server = Start-Process powershell -ArgumentList $serveArgs -NoNewWindow -PassThru `
    -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err"

$deadline = (Get-Date).AddSeconds(20)
while (-not (Test-Path $portFile) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
if (-not (Test-Path $portFile)) {
    Get-Content $serverLog, "$serverLog.err" -ErrorAction SilentlyContinue | Write-Host
    Fail 'The local game server did not start.'
}
$localPort = [int](Get-Content $portFile -Raw).Trim()
Write-Host "  Local game server on port $localPort" -ForegroundColor Green

# Public tunnel.
$tunnelLog = Join-Path $WorkDir 'tunnel.log'
Remove-Item -Force $tunnelLog, "$tunnelLog.out" -ErrorAction SilentlyContinue
Write-Host '  Opening the public link (takes a few seconds)...'
$tunnel = Start-Process $cloudflared -NoNewWindow -PassThru `
    -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$localPort") `
    -RedirectStandardError $tunnelLog -RedirectStandardOutput "$tunnelLog.out"

$link = $null
$deadline = (Get-Date).AddSeconds(45)
while (-not $link -and (Get-Date) -lt $deadline -and -not $tunnel.HasExited) {
    Start-Sleep -Milliseconds 300
    $text = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
    if ($text -match 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com') { $link = $Matches[0] }
}
if (-not $link) {
    Get-Content $tunnelLog -Tail 15 -ErrorAction SilentlyContinue | Write-Host
    if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
    Fail 'Could not open the public link. The game still works on this PC; check the internet connection and try again.'
}

$playLink = "$link/"
try { Set-Clipboard -Value $playLink } catch {}

Write-Host ''
Write-Host '  ================================================================' -ForegroundColor Magenta
Write-Host '   SEND THIS LINK TO TESTERS (PC or phone, anywhere in the world):' -ForegroundColor Magenta
Write-Host ''
Write-Host "     $playLink" -ForegroundColor White
Write-Host ''
Write-Host '   (already copied to the clipboard)' -ForegroundColor DarkGray
Write-Host '  ================================================================' -ForegroundColor Magenta
Write-Host ''
Write-Host '  - Testers just open it in Chrome, Edge, Safari or Firefox. Nothing to install.'
Write-Host '  - Phones: scan the QR code on the page that just opened.'
Write-Host '  - The link works only while this window is open, and is new every run.'
Write-Host '  - First load downloads the game from this PC, so a slow upload means a slow first load.'
Write-Host ''
Write-Host '  Close this window to stop sharing.' -ForegroundColor Yellow
Write-Host ''

if (-not $NoQr) { Open-QrPage $playLink }

try {
    while (-not $tunnel.HasExited) {
        Start-Sleep -Seconds 2
    }
    Write-Host '  The tunnel closed unexpectedly. Run the share file again for a new link.' -ForegroundColor Red
    Get-Content $tunnelLog -Tail 10 -ErrorAction SilentlyContinue | Write-Host
} finally {
    foreach ($p in @($tunnel, $server)) {
        if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
}
