$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $up = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if (-not $up) {
    Start-Process node -ArgumentList 'F:\WEB\BARRACA\server\index.js' -WorkingDirectory 'F:\WEB\BARRACA' -RedirectStandardOutput 'F:\WEB\BARRACA\server.log' -RedirectStandardError 'F:\WEB\BARRACA\server.err.log' -WindowStyle Hidden | Out-Null
  }
  Start-Sleep -Seconds 5
}