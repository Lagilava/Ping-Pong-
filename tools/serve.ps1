<#
  serve.ps1 - zero-dependency local web server + launcher for Ping Pong Neon.

  Started by "Play Ping Pong.bat". Uses only what ships with Windows
  (PowerShell 5.1+ and .NET), so testers don't need Node, Python or admin rights.

  It serves the game/ folder on http://127.0.0.1:<port>/ (preferring 8080 so
  saved progress, which the browser keys by address, stays put between runs),
  opens the game in Chrome or Edge with GPU-friendly flags, and keeps serving
  until this window is closed.

  Parameters
    -Root     folder to serve (default: ..\game next to this script)
    -Port     preferred port (default 8080; the next free one is used if taken)
    -NoBrowser  only run the server
    -Uncapped   ask Chrome to ignore vsync (lets 60 Hz screens show >60 fps,
                at the cost of tearing; 120 Hz screens don't need this)
#>
param(
    [string]$Root = (Join-Path $PSScriptRoot '..\game'),
    [int]$Port = 8080,
    [switch]$NoBrowser,
    [switch]$Uncapped
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path
$Marker = 'pingpong-neon-server'

$MimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.wasm' = 'application/wasm'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.mp3'  = 'audio/mpeg'
    '.ogg'  = 'audio/ogg'
    '.wav'  = 'audio/wav'
    '.woff2'= 'font/woff2'
    '.woff' = 'font/woff'
    '.ttf'  = 'font/ttf'
    '.txt'  = 'text/plain; charset=utf-8'
}

function Test-OurServer([int]$p) {
    try {
        $client = New-Object System.Net.WebClient
        $reply = $client.DownloadString("http://127.0.0.1:$p/__ping")
        return ($reply -eq $Marker)
    } catch { return $false }
}

function Start-Listener([int]$first) {
    for ($p = $first; $p -lt $first + 20; $p++) {
        try {
            $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
            $l.Start()
            return @{ Listener = $l; Port = $p }
        } catch {
            if (Test-OurServer $p) { return @{ Listener = $null; Port = $p } }
        }
    }
    throw "No free port between $first and $($first + 19)."
}

function Find-Browser {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

function Open-Game([string]$url) {
    $browser = Find-Browser
    if (-not $browser) {
        Write-Host "  Chrome/Edge not found - opening your default browser." -ForegroundColor Yellow
        Start-Process $url
        return
    }
    # A dedicated profile makes sure these flags apply even if the browser is
    # already open, and keeps the game's saves separate from normal browsing.
    $profileDir = Join-Path $env:LOCALAPPDATA 'PingPongNeon\browser-profile'
    $browserArgs = @(
        "--user-data-dir=`"$profileDir`"",
        "--app=$url",
        '--start-maximized',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-high-performance-gpu',      # use the discrete GPU on dual-GPU laptops
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--autoplay-policy=no-user-gesture-required'
    )
    if ($Uncapped) {
        $browserArgs += '--disable-gpu-vsync'
        $browserArgs += '--disable-frame-rate-limit'
    }
    Start-Process -FilePath $browser -ArgumentList $browserArgs
    Write-Host "  Opened in $([System.IO.Path]::GetFileNameWithoutExtension($browser))." -ForegroundColor Green
}

# Each connection is handled on a small runspace pool so a slow request (the
# browser buffering music, say) can never stall the other files.
$ConnectionHandler = {
    param($client, [string]$Root, [hashtable]$MimeTypes, [string]$Marker)

    function Send-Response($stream, [int]$status, [string]$statusText, [hashtable]$headers, [byte[]]$body, [long]$bodyOffset, [long]$bodyLength, [string]$filePath) {
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append("HTTP/1.1 $status $statusText`r`n")
        foreach ($k in $headers.Keys) { [void]$sb.Append("${k}: $($headers[$k])`r`n") }
        [void]$sb.Append("Connection: close`r`n`r`n")
        $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
        $stream.Write($head, 0, $head.Length)
        if ($body) {
            $stream.Write($body, 0, $body.Length)
        } elseif ($filePath -and $bodyLength -gt 0) {
            $fs = [System.IO.File]::OpenRead($filePath)
            try {
                [void]$fs.Seek($bodyOffset, 'Begin')
                $buffer = New-Object byte[] 65536
                $remaining = $bodyLength
                while ($remaining -gt 0) {
                    $n = $fs.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
                    if ($n -le 0) { break }
                    $stream.Write($buffer, 0, $n)
                    $remaining -= $n
                }
            } finally { $fs.Dispose() }
        }
    }

    function Send-Text($stream, [int]$status, [string]$statusText, [string]$text) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
        Send-Response $stream $status $statusText @{ 'Content-Type' = 'text/plain; charset=utf-8'; 'Content-Length' = $bytes.Length } $bytes 0 0 $null
    }

    function Handle-Client($client) {
        $client.ReceiveTimeout = 5000
        $client.SendTimeout = 15000
        $stream = $client.GetStream()
        try {
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { return }
            $headers = @{}
            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
                $i = $line.IndexOf(':')
                if ($i -gt 0) { $headers[$line.Substring(0, $i).Trim().ToLowerInvariant()] = $line.Substring($i + 1).Trim() }
            }
            $parts = $requestLine.Split(' ')
            $method = $parts[0]
            $rawPath = ($parts[1] -split '\?')[0]

            if ($method -ne 'GET' -and $method -ne 'HEAD') { Send-Text $stream 405 'Method Not Allowed' 'Method not allowed'; return }
            if ($rawPath -eq '/__ping') { Send-Text $stream 200 'OK' $Marker; return }

            $relative = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
            if ($relative -eq '') { $relative = 'index.html' }
            $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
            $rootPrefix = $Root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { Send-Text $stream 403 'Forbidden' 'Forbidden'; return }
            if ([System.IO.Directory]::Exists($full)) { $full = Join-Path $full 'index.html' }
            if (-not [System.IO.File]::Exists($full)) { Send-Text $stream 404 'Not Found' "Not found: $relative"; return }

            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $type = $MimeTypes[$ext]
            if (-not $type) { $type = 'application/octet-stream' }
            $info = New-Object System.IO.FileInfo($full)
            $size = $info.Length
            # Revalidation: unchanged files answer 304 so reloads are near-instant.
            $lastModified = $info.LastWriteTimeUtc.ToString('r')
            if ($headers['if-modified-since'] -eq $lastModified) {
                Send-Response $stream 304 'Not Modified' @{ 'Last-Modified' = $lastModified; 'Cache-Control' = 'no-cache' } $null 0 0 $null
                return
            }
            $respHeaders = @{
                'Content-Type'  = $type
                'Accept-Ranges' = 'bytes'
                'Cache-Control' = 'no-cache'
                'Last-Modified' = $lastModified
            }

            # Range requests: browsers stream and seek audio this way.
            $range = $headers['range']
            if ($range -and $range -match '^bytes=(\d*)-(\d*)$') {
                $start = 0L; $end = $size - 1
                if ($Matches[1] -ne '') { $start = [long]$Matches[1] }
                if ($Matches[2] -ne '') { $end = [Math]::Min([long]$Matches[2], $size - 1) }
                if ($Matches[1] -eq '' -and $Matches[2] -ne '') { $start = [Math]::Max(0, $size - [long]$Matches[2]); $end = $size - 1 }
                if ($start -gt $end -or $start -ge $size) {
                    $respHeaders['Content-Range'] = "bytes */$size"
                    Send-Response $stream 416 'Range Not Satisfiable' $respHeaders $null 0 0 $null
                    return
                }
                $len = $end - $start + 1
                $respHeaders['Content-Range'] = "bytes $start-$end/$size"
                $respHeaders['Content-Length'] = $len
                if ($method -eq 'HEAD') { $len = 0 }
                Send-Response $stream 206 'Partial Content' $respHeaders $null $start $len $full
                return
            }

            $respHeaders['Content-Length'] = $size
            $sendLen = $size
            if ($method -eq 'HEAD') { $sendLen = 0 }
            Send-Response $stream 200 'OK' $respHeaders $null 0 $sendLen $full
        } catch [System.IO.IOException] {
            # Browser closed the connection early (normal when it aborts a media fetch).
        } catch {
            # Ignore: a single failed request shouldn't take the server down.
        } finally {
            try { $stream.Flush() } catch {}
            $client.Close()
        }
    }

    Handle-Client $client
}

# -- Main --------------------------------------------------------------------
Write-Host ''
Write-Host '  PING PONG - NEON EDITION' -ForegroundColor Cyan
Write-Host "  Serving $Root"

$server = Start-Listener $Port
$url = "http://127.0.0.1:$($server.Port)/index.html"

if (-not $server.Listener) {
    Write-Host "  Game server already running on port $($server.Port) - reusing it." -ForegroundColor Green
    if (-not $NoBrowser) { Open-Game $url }
    Start-Sleep -Seconds 3
    return
}

Write-Host "  Game running at $url" -ForegroundColor Green
if (-not $NoBrowser) { Open-Game $url }
Write-Host ''
Write-Host '  Keep this window open while playing. Close it to stop the game server.' -ForegroundColor Yellow
Write-Host '  In game: F2 shows FPS and quality, Esc pauses.'
Write-Host ''

$listener = $server.Listener
$pool = [RunspaceFactory]::CreateRunspacePool(1, 8)
$pool.Open()
$inFlight = New-Object System.Collections.ArrayList
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $ps = [PowerShell]::Create()
        $ps.RunspacePool = $pool
        [void]$ps.AddScript($ConnectionHandler).AddArgument($client).AddArgument($Root).AddArgument($MimeTypes).AddArgument($Marker)
        [void]$inFlight.Add(@{ PS = $ps; Handle = $ps.BeginInvoke() })
        # Reap finished requests.
        for ($i = $inFlight.Count - 1; $i -ge 0; $i--) {
            $job = $inFlight[$i]
            if ($job.Handle.IsCompleted) {
                try { [void]$job.PS.EndInvoke($job.Handle) } catch {}
                $job.PS.Dispose()
                $inFlight.RemoveAt($i)
            }
        }
    }
} finally {
    $listener.Stop()
    $pool.Close()
}
