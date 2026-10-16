$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot 'data\companion-state.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'GPT娘桌宠没有运行。'; exit }
$state = Get-Content -LiteralPath $statePath -Raw -Encoding utf8 | ConvertFrom-Json
$health = Invoke-RestMethod -Uri ($state.url + '/health') -TimeoutSec 3
if ($health.appId -ne 'gpt-pet-companion-local' -or $health.instance -ne $state.instance) { throw '服务身份不一致，未执行退出。' }
Invoke-RestMethod -Uri ($state.url + '/api/quit') -Method Post -TimeoutSec 5 | Out-Null
Wait-Process -Id $state.pid -Timeout 15 -ErrorAction SilentlyContinue
if (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) { throw '桌宠仍在退出，请稍后重试。' }
Write-Output 'GPT娘桌宠已退出。'
