param([string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\GPT-Pet-Companion'))
$ErrorActionPreference = 'Stop'
$sourceDir = [IO.Path]::GetFullPath($PSScriptRoot)
$installRoot = [IO.Path]::GetFullPath($InstallDir)
if ($sourceDir -eq $installRoot) { throw '安装源和目标不能相同。' }
if (Test-Path -LiteralPath $installRoot) {
    $marker = Join-Path $installRoot 'app-manifest.json'
    if (-not (Test-Path -LiteralPath $marker)) { throw '目标目录已存在且不是本应用，未覆盖。' }
    $identity = Get-Content -LiteralPath $marker -Raw -Encoding utf8 | ConvertFrom-Json
    if ($identity.appId -ne 'gpt-pet-companion-local') { throw '目标应用身份不一致，未覆盖。' }
    if (Test-Path -LiteralPath (Join-Path $installRoot 'data\companion-state.json')) {
        & (Join-Path $installRoot 'stop.ps1')
    }
}
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
& robocopy.exe $sourceDir $installRoot /E /XD build-deps logs qa helper-profile panel-profile /XF companion-state.json preferences.json main-config.jsonc /NFL /NDL /NJH /NJS /NP /R:1 /W:1
if ($LASTEXITCODE -ge 8) { throw ('文件复制失败，robocopy 返回 ' + $LASTEXITCODE) }
$dataDir = Join-Path $installRoot 'data\dsh-pet'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$configPath = Join-Path $dataDir 'main-config.jsonc'
if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item -LiteralPath (Join-Path $sourceDir 'default-config.json') -Destination $configPath
}
$pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $pwshCommand) { $pwshCommand = Get-Command powershell.exe -ErrorAction Stop }
$pwshPath = $pwshCommand.Source
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$menuDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\GPT娘桌宠'
New-Item -ItemType Directory -Path $menuDir -Force | Out-Null
$shortcutPaths = @(
    (Join-Path $desktop 'GPT娘桌宠（独立版）.lnk'),
    (Join-Path $menuDir 'GPT娘桌宠（独立版）.lnk')
)
foreach ($shortcutPath in $shortcutPaths) {
    if (Test-Path -LiteralPath $shortcutPath) {
        $oldShortcut = $shell.CreateShortcut($shortcutPath)
        if ($oldShortcut.Arguments -notlike ('*' + $installRoot + '*')) { throw '同名快捷方式属于其他应用，未覆盖。' }
    }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $pwshPath
    $shortcut.Arguments = '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $installRoot 'launch.ps1') + '"'
    $shortcut.WorkingDirectory = $installRoot
    $shortcut.IconLocation = (Join-Path $installRoot 'assets\pet.ico') + ',0'
    $shortcut.Description = '白发龙娘独立桌宠 · 36 段慢动作与表情气泡'
    $shortcut.WindowStyle = 7
    $shortcut.Save()
}
@{InstallPath=$installRoot;DesktopShortcut=$shortcutPaths[0];StartMenuShortcut=$shortcutPaths[1]} | ConvertTo-Json
exit 0
