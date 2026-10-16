$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
Push-Location -LiteralPath $PSScriptRoot
try {
    & $npmCommand.Source ci --ignore-scripts --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw 'npm 依赖安装失败。' }
    & $nodeCommand.Source (Join-Path $PSScriptRoot 'setup.mjs')
    if ($LASTEXITCODE -ne 0) { throw '运行环境准备失败。' }
} finally { Pop-Location }
