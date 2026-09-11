@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

set "MODE=%~1"
set "RUN_DATE=%~2"

if not defined MODE (
    set "MODE=current"
)

if not exist ".env.local" (
    echo ERROR: .env.local was not found in the DictazIQ repository.
    exit /b 10
)

if not exist "logs\workers" (
    mkdir "logs\workers"
)

for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')"') do (
    set "STAMP=%%I"
)

set "LOG_FILE=logs\workers\dictaziq-%MODE%-%STAMP%.log"
set "TEMP_LOG=%TEMP%\dictaziq-worker-%RANDOM%-%RANDOM%.log"

echo ============================================================
echo DictazIQ Autonomous Production Worker
echo Mode: %MODE%
echo Started: %STAMP% UTC
echo Repository: %CD%
echo Log: %LOG_FILE%
echo ============================================================

>>"%LOG_FILE%" echo ============================================================
>>"%LOG_FILE%" echo DictazIQ Autonomous Production Worker
>>"%LOG_FILE%" echo Mode: %MODE%
>>"%LOG_FILE%" echo Started: %STAMP% UTC
>>"%LOG_FILE%" echo Repository: %CD%
>>"%LOG_FILE%" echo ============================================================

if /I "%MODE%"=="current" goto :current

if /I "%MODE%"=="tomorrow" goto :tomorrow

if /I "%MODE%"=="ratings" goto :ratings

echo ERROR: Unknown worker mode "%MODE%".
echo Valid modes: current, tomorrow, ratings
>>"%LOG_FILE%" echo ERROR: Unknown worker mode "%MODE%".
exit /b 11


:current

if not defined RUN_DATE (
    for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')"') do (
        set "RUN_DATE=%%I"
    )
)

goto :production


:tomorrow

if not defined RUN_DATE (
    for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().AddDays(1).ToString('yyyy-MM-dd')"') do (
        set "RUN_DATE=%%I"
    )
)

goto :production


:production

echo.
echo Production date: %RUN_DATE%
>>"%LOG_FILE%" echo Production date: %RUN_DATE%

echo.
echo [1/3] Checking database connectivity...
call :run node --env-file=.env.local --import tsx scripts\check-db.ts
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :failure

echo.
echo [2/3] Ingesting API-Football fixtures for %RUN_DATE%...
call :run node --env-file=.env.local --import tsx scripts\ingest-api-football-daily-fixtures-v0.2.ts "%RUN_DATE%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :failure

echo.
echo [3/3] Executing DictazIQ production cycle...
call :run node --env-file=.env.local --import tsx scripts\production-cycle-v0.3.ts "%RUN_DATE%" --execute
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :failure

goto :success


:ratings

for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')"') do (
    set "RUN_DATE=%%I"
)

echo.
echo Rating refresh date: %RUN_DATE%
>>"%LOG_FILE%" echo Rating refresh date: %RUN_DATE%

echo.
echo [1/2] Checking database connectivity...
call :run node --env-file=.env.local --import tsx scripts\check-db.ts
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :failure

echo.
echo [2/2] Refreshing FootballDatabase ratings...
call :run node --env-file=.env.local --import tsx scripts\ingest-football-database-ratings.ts 20
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :failure

goto :success


:run

echo [RUN] %*
>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [RUN] %*

%* >"%TEMP_LOG%" 2>&1

set "COMMAND_RC=%ERRORLEVEL%"

type "%TEMP_LOG%"
type "%TEMP_LOG%" >>"%LOG_FILE%"

del /q "%TEMP_LOG%" >nul 2>&1

if not "%COMMAND_RC%"=="0" (
    echo [FAILED] Exit code: %COMMAND_RC%
    >>"%LOG_FILE%" echo [FAILED] Exit code: %COMMAND_RC%
    exit /b %COMMAND_RC%
)

echo [PASS]
>>"%LOG_FILE%" echo [PASS]

exit /b 0


:failure

echo.
echo ============================================================
echo DICTAZIQ WORKER FAILED
echo Mode: %MODE%
echo Date: %RUN_DATE%
echo Exit code: %RC%
echo Log: %LOG_FILE%
echo ============================================================

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo DICTAZIQ WORKER FAILED
>>"%LOG_FILE%" echo Exit code: %RC%

exit /b %RC%


:success

echo.
echo ============================================================
echo DICTAZIQ WORKER COMPLETED SUCCESSFULLY
echo Mode: %MODE%
echo Date: %RUN_DATE%
echo Log: %LOG_FILE%
echo ============================================================

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo DICTAZIQ WORKER COMPLETED SUCCESSFULLY
>>"%LOG_FILE%" echo Mode: %MODE%
>>"%LOG_FILE%" echo Date: %RUN_DATE%

exit /b 0