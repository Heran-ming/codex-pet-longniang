param([switch]$Check)
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'companion.mjs'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '需要 Node.js 22.12 或以上版本。' }
if ($Check) {
    $previousDshHome = $env:DSH_HOME
    $previousElectron = $env:DSH_PET_ELECTRON_PATH
    try {
        $env:DSH_HOME = Join-Path $PSScriptRoot 'data'
        if (-not $env:GPT_PET_ELECTRON_PATH) {
            $bundledElectron = Join-Path $PSScriptRoot 'runtime\electron\electron.exe'
            $env:DSH_PET_ELECTRON_PATH = if (Test-Path -LiteralPath $bundledElectron) { $bundledElectron } else { Join-Path $env:USERPROFILE '.dsh\electron\electron.exe' }
        } else { $env:DSH_PET_ELECTRON_PATH = $env:GPT_PET_ELECTRON_PATH }
        & $nodeCommand.Source (Join-Path $PSScriptRoot 'node_modules\dsh-pet\lib\standalone.js') --check
    } finally {
        $env:DSH_HOME = $previousDshHome
        $env:DSH_PET_ELECTRON_PATH = $previousElectron
    }
    exit $LASTEXITCODE
}
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $entry + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
