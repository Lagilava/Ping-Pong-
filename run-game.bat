@echo off
setlocal
cd /d "%~dp0"

set "PORT=8080"
set "URL=http://localhost:%PORT%/ping_pong.html"

where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js is not installed or not on PATH.
    echo     Install it from https://nodejs.org then run this file again.
    goto :done
)

if not exist "node_modules\http-server\package.json" (
    echo [*] Installing dependencies, this only happens once...
    call npm install
    if errorlevel 1 (
        echo [!] npm install failed. See the messages above.
        goto :done
    )
)

rem Is the port already taken by something else?
powershell -NoProfile -Command "try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 }catch{ exit 1 }"
if not errorlevel 1 (
    echo [*] Port %PORT% is already serving - reusing it.
    goto :open
)

echo [*] Starting server on port %PORT% ...
rem Call the local binary directly rather than npx, and keep a log so a failure to
rem start is visible instead of guessed at.
start "PingPong Server" /min cmd /c ""%~dp0node_modules\.bin\http-server.cmd" -p %PORT% -c-1 > "%~dp0server.log" 2>&1"

echo [*] Waiting for the server to respond...
rem NOTE: this must stay on ONE line. Splitting a powershell -Command across lines with
rem caret continuations mangles the command and makes it always report failure.
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
    echo [!] The server did not start within 30 seconds.
    echo     Server output:
    if exist "%~dp0server.log" type "%~dp0server.log"
    goto :done
)

:open
echo [*] Opening Chrome...
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
    start "" "%CHROME%" "%URL%"
) else (
    echo [!] Chrome not found - opening your default browser instead.
    start "" "%URL%"
)

echo.
echo     Game running at %URL%
echo     Press 3 in-game to toggle the 2.5D renderer.
echo     Close the minimised "PingPong Server" window to stop the server.
echo.

:done
echo Press any key to close this window . . .
pause >nul
