param(
    [string]$Installer,
    [string]$Uninstaller,
    [string]$CompleteZip,
    [string]$BrokenZip,
    [string]$MirrorZip,
    [string]$Version = '7.1.17'
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('ivlyrics-installer-fixture-' + [Guid]::NewGuid().ToString('N'))
$profile = Join-Path $root (([string][char]0xAC00) + ' Spicetify profile')
$config = Join-Path $profile 'config-xpui.ini'
$customApps = Join-Path $profile 'CustomApps'
$app = Join-Path $customApps 'ivLyrics'
$originalVersion = '7.1.16'
$global:ivlFixtureTrace = [Collections.Generic.List[string]]::new()
$global:ivlFixtureActiveApps = 'other'
$global:ivlFixtureArtifact = $CompleteZip
$global:ivlFixtureCorruptChecksum = $false
$global:ivlFixtureUseProxy = $false
$global:ivlFixtureGitHubDownloadFails = $false
$global:ivlFixtureProxyVersion = ''
$global:ivlFixtureProxyArtifact = $null
$global:ivlFixtureFailApply = $false
$global:ivlFixtureRejectRoute = $false
$global:ivlFixtureRejectApp = $false
$global:ivlFixtureSkipRegistrationWrite = $false
$global:ivlFixtureUninstallFailure = ''
$global:ivlFixtureOffline = $false
$releaseUri = 'https://api.github.com/repos/ivLis-Studio/ivLyrics/releases/latest'
$global:ivlFixtureVersion = $Version

function Assert-Equal($Actual, $Expected, [string]$Label) {
    if ($Actual -cne $Expected) {
        throw "$Label expected $Expected but got $Actual"
    }
}

function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
    if ($TimeoutSec -le 0) { throw "Missing request timeout for $Uri" }
    if ($global:ivlFixtureOffline) { throw 'Fixture is offline' }
    switch ($Uri) {
        'https://api.github.com' { return @{ StatusCode = 200 } }
        'https://release.example.test/ivLyrics.zip' {
            if ($global:ivlFixtureUseProxy) { throw 'Unexpected GitHub download' }
            if ($global:ivlFixtureGitHubDownloadFails) { throw 'GitHub asset unavailable' }
            Copy-Item -LiteralPath $global:ivlFixtureArtifact -Destination $OutFile
        }
        'https://release.example.test/ivLyrics.zip.sha256' {
            $hash = if ($global:ivlFixtureCorruptChecksum) { '0' * 64 } else { (Get-FileHash -LiteralPath $global:ivlFixtureArtifact).Hash }
            Set-Content -LiteralPath $OutFile -Value "$hash  ivLyrics.zip" -Encoding Ascii
        }
        'https://ivlis.kr/ivLyrics/proxy.php?action=download' {
            $artifact = if ($global:ivlFixtureProxyArtifact) { $global:ivlFixtureProxyArtifact } else { $global:ivlFixtureArtifact }
            Copy-Item -LiteralPath $artifact -Destination $OutFile
        }
        default { throw "Unexpected network URI: $Uri" }
    }
}

function Invoke-RestMethod {
    param($Uri, $TimeoutSec)
    if ($TimeoutSec -le 0) { throw "Missing request timeout for $Uri" }
    if ($Uri -eq 'https://ivlis.kr/ivLyrics/proxy.php?action=version') {
        $proxyVersion = $global:ivlFixtureProxyVersion
        if ($global:ivlFixtureUseProxy) { $proxyVersion = $global:ivlFixtureVersion }
        if (-not $proxyVersion) { throw 'Mirror unavailable' }
        $artifact = if ($global:ivlFixtureProxyArtifact) { $global:ivlFixtureProxyArtifact } else { $global:ivlFixtureArtifact }
        return @{
            zip_available = $true
            tag_name = "v$proxyVersion"
            sha256 = (Get-FileHash -LiteralPath $artifact).Hash
        }
    }
    Assert-Equal $Uri $releaseUri 'Release API'
    $tag = if ($global:ivlFixtureUseProxy) { 'invalid' } else { "v$global:ivlFixtureVersion" }
    return @{
        tag_name = $tag
        assets = @(
            @{ name = 'ivLyrics.zip'; browser_download_url = 'https://release.example.test/ivLyrics.zip' },
            @{ name = 'ivLyrics.zip.sha256'; browser_download_url = 'https://release.example.test/ivLyrics.zip.sha256' }
        )
    }
}

function spicetify {
    $command = $args -join ' '
    $global:ivlFixtureTrace.Add($command)
    $global:LASTEXITCODE = 0
    switch ($command) {
        '-c' { return $config }
        'config custom_apps' { return $global:ivlFixtureActiveApps }
        'config custom_apps ivLyrics' {
            if ($global:ivlFixtureSkipRegistrationWrite) { return 'warning  Failed to save config: Access denied' }
            $global:ivlFixtureActiveApps = 'other|ivLyrics'
        }
        'config custom_apps ivLyrics-' {
            if ($global:ivlFixtureUninstallFailure -eq 'config-not-saved') { return 'warning  Failed to save config: Access denied' }
            $global:ivlFixtureActiveApps = 'other'
        }
        '-n apply' {
            $versionFile = Join-Path $app 'version.txt'
            $registered = ($global:ivlFixtureActiveApps -split '\|') -contains 'ivLyrics'
            $versionOnDisk = if ($registered -and (Test-Path -LiteralPath $versionFile)) {
                (Get-Content -LiteralPath $versionFile -Raw).Trim()
            } else { '' }
            $global:ivlFixtureTrace.Add("apply:$versionOnDisk")
            if ($global:ivlFixtureFailApply -and $versionOnDisk -eq $global:ivlFixtureVersion) { $global:LASTEXITCODE = 1 }
            if ($global:ivlFixtureRejectRoute -and $versionOnDisk -eq $global:ivlFixtureVersion) {
                Write-Error 'Spotify version mismatch with Spicetify.'
            }
            if ($global:ivlFixtureRejectApp -and $versionOnDisk -eq $global:ivlFixtureVersion) {
                Write-Output (([string][char]27) + '[31merror' + ([string][char]27) + '[0m  Custom app "ivLyrics" not found')
                Write-Output 'success  Refreshed custom apps'
            }
            Write-Output 'error  Custom app "other" not found'
        }
        '-n auto' { $global:LASTEXITCODE = 1 }
        'apply' {
            if ($global:ivlFixtureActiveApps -eq 'other') {
                if ($global:ivlFixtureUninstallFailure -eq 'exit-code') { $global:LASTEXITCODE = 1 }
                if ($global:ivlFixtureUninstallFailure -eq 'version-mismatch') {
                    Write-Error 'Spotify version mismatch with Spicetify.'
                }
            }
        }
        default { throw "Unexpected Spicetify command: $command" }
    }
}

function powershell.exe {
    Assert-Equal $args[-1] $app 'Updater registration directory'
    if (-not (Test-Path -LiteralPath $args[4] -PathType Leaf)) { throw 'Registration script is missing' }
    $global:ivlFixtureTrace.Add('protocol')
    $global:LASTEXITCODE = 0
}

function Get-Process {
    param($Name)
    Assert-Equal $Name 'Spotify' 'Spotify process'
    $global:ivlFixtureTrace.Add('probe')
}

function Start-Process {
    param($FilePath)
    if ($FilePath -notlike 'spotify://ivLyrics/*') { throw "Unexpected launch: $FilePath" }
    $global:ivlFixtureTrace.Add('launch')
}

function Start-Sleep {}

function Invoke-Installer([int]$ExpectedExit, [string]$ExpectedCalls, [switch]$Force) {
    $global:ivlFixtureTrace.Clear()
    $global:LASTEXITCODE = 0
    & $Installer -Force:$Force
    Assert-Equal $LASTEXITCODE $ExpectedExit 'Installer exit code'
    Assert-Equal ($global:ivlFixtureTrace -join '|') $ExpectedCalls 'Installer calls'
    Assert-Equal (Test-Path -LiteralPath (Join-Path $customApps '.ivLyrics-install.lock')) $false 'Stale installer lock'
    Assert-Equal @(Get-ChildItem -LiteralPath $customApps -Force -Filter '.ivLyrics-install-*').Count 0 'Temporary backup'
}

function Assert-Version([string]$Expected) {
    Assert-Equal (Get-Content -LiteralPath (Join-Path $app 'version.txt') -Raw).Trim() $Expected 'Installed version'
}

function Invoke-Uninstaller([int]$ExpectedExit, [string]$ExpectedCalls) {
    $env:LOCALAPPDATA = Join-Path $root 'LocalAppData'
    $env:APPDATA = Join-Path $root 'AppData'
    New-Item -ItemType Directory -Path $env:LOCALAPPDATA, $env:APPDATA -Force | Out-Null
    $answers = [Collections.Generic.Queue[string]]::new()
    $answers.Enqueue('y')
    $answers.Enqueue('n')
    function Read-Host { return $answers.Dequeue() }
    function Clear-Host {}
    function Test-Path {
        [CmdletBinding()]
        param([string]$LiteralPath, [string]$PathType)
        if ($LiteralPath -like 'HKCU:*') { return $false }
        Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
    }
    $global:ivlFixtureTrace.Clear()
    $global:LASTEXITCODE = 0
    & $Uninstaller
    Assert-Equal $LASTEXITCODE $ExpectedExit 'Uninstaller exit code'
    Assert-Equal ($global:ivlFixtureTrace -join '|') $ExpectedCalls 'Uninstaller calls'
}

function Get-TestScriptFunction {
    param([string]$Path, [string]$Name)
    $parseErrors = $null
    $syntax = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$parseErrors)
    if ($parseErrors) { throw "Updater script could not be parsed: $parseErrors" }
    $definition = $syntax.Find({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
    }, $false)
    return [scriptblock]::Create($definition.Extent.Text)
}

function Test-RegisteredUpdaterProfile {
    . (Get-TestScriptFunction -Path (Join-Path $app 'updater/windows/ivlyrics-updater.ps1') -Name 'Start-IvLyricsUpdate')
    . (Get-TestScriptFunction -Path (Join-Path $app 'updater/windows/register-updater-protocol.ps1') -Name 'Save-IvLyricsUpdaterProfileState')
    $ProfileDirectory = $profile
    $UpdaterRoot = Join-Path $root 'updater fixture'
    New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
    $expectedState = 'previous state fixture'
    $expectedXdgState = 'previous XDG state fixture'
    function Write-UpdaterLog {}
    function Save-IvLyricsInstaller {
        param([string]$DestinationPath)
        New-Item -ItemType File -Path $DestinationPath | Out-Null
    }
    function powershell.exe {
        Assert-Equal $env:SPICETIFY_CONFIG $profile 'Updater child profile'
        Assert-Equal $env:SPICETIFY_STATE $expectedState 'Updater child Spicetify state'
        Assert-Equal $env:XDG_STATE_HOME $expectedXdgState 'Updater child XDG state'
        $global:ivlFixtureTrace.Add('profile-passed')
        $global:LASTEXITCODE = 0
    }

    $previousProfile = $env:SPICETIFY_CONFIG
    $previousState = $env:SPICETIFY_STATE
    $previousXdgState = $env:XDG_STATE_HOME
    try {
        $env:SPICETIFY_CONFIG = 'previous profile fixture'
        $env:SPICETIFY_STATE = 'previous state fixture'
        $env:XDG_STATE_HOME = 'previous XDG state fixture'
        $global:ivlFixtureTrace.Clear()
        Start-IvLyricsUpdate
        Assert-Equal ($global:ivlFixtureTrace -join '|') 'profile-passed' 'Updater launched installer once'
        Assert-Equal $env:SPICETIFY_CONFIG 'previous profile fixture' 'Parent profile restored'

        $expectedState = Join-Path $root 'separate state $(literal)'
        $expectedXdgState = Join-Path $root 'separate XDG state'
        Push-Location -LiteralPath $root
        try {
            $env:SPICETIFY_STATE = 'separate state $(literal)'
            $env:XDG_STATE_HOME = 'separate XDG state'
            Save-IvLyricsUpdaterProfileState -UpdaterDirectory $UpdaterRoot -ProfileDirectory $profile
        }
        finally {
            Pop-Location
        }
        $env:SPICETIFY_STATE = 'previous state fixture'
        $env:XDG_STATE_HOME = 'previous XDG state fixture'
        $global:ivlFixtureTrace.Clear()
        Start-IvLyricsUpdate
        Assert-Equal ($global:ivlFixtureTrace -join '|') 'profile-passed' 'Registered updater launched installer once'
        Assert-Equal $env:SPICETIFY_CONFIG 'previous profile fixture' 'Parent profile restored'
        Assert-Equal $env:SPICETIFY_STATE 'previous state fixture' 'Parent Spicetify state restored'
        Assert-Equal $env:XDG_STATE_HOME 'previous XDG state fixture' 'Parent XDG state restored'
    }
    finally {
        $env:SPICETIFY_CONFIG = $previousProfile
        $env:SPICETIFY_STATE = $previousState
        $env:XDG_STATE_HOME = $previousXdgState
    }
}

try {
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    New-Item -ItemType File -Path $config | Out-Null
    $env:TEMP = $root
    $env:TMP = $root

    $global:ivlFixtureSkipRegistrationWrite = $true
    Invoke-Installer 1 '-c|config custom_apps|probe|config custom_apps ivLyrics|config custom_apps|config custom_apps ivLyrics-|config custom_apps'
    Assert-Equal (Test-Path -LiteralPath $app) $false 'First install did not keep an unregistered app'
    Assert-Equal $global:ivlFixtureActiveApps 'other' 'The failed registration kept the original config'
    $global:ivlFixtureSkipRegistrationWrite = $false
    Write-Output 'PASS a silent config write failure aborts installation'

    $global:ivlFixtureFailApply = $true
    Invoke-Installer 1 "-c|config custom_apps|probe|config custom_apps ivLyrics|config custom_apps|-n apply|apply:$Version|-n auto|config custom_apps ivLyrics-|config custom_apps|-n apply|apply:"
    Assert-Equal (Test-Path -LiteralPath $app) $false 'Failed first install leaves no app'
    Assert-Equal $global:ivlFixtureActiveApps 'other' 'First install configuration restored'
    $global:ivlFixtureFailApply = $false
    Write-Output 'PASS first-install rollback'

    $interrupted = Join-Path $customApps '.ivLyrics-install.transaction'
    New-Item -ItemType Directory -Path $interrupted, $app -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $app 'version.txt') -Value $Version -Encoding Ascii
    Set-Content -LiteralPath (Join-Path $interrupted 'before') -Value '0 0' -Encoding Ascii
    New-Item -ItemType File -Path (Join-Path $interrupted 'apply-started'), (Join-Path $interrupted 'registration-started') | Out-Null
    $global:ivlFixtureActiveApps = 'other|ivLyrics'
    $global:ivlFixtureOffline = $true
    Invoke-Installer 1 '-c|probe|config custom_apps ivLyrics-|config custom_apps|-n apply|apply:'
    Assert-Equal (Test-Path -LiteralPath $app) $false 'An interrupted first install is removed'
    Assert-Equal (Test-Path -LiteralPath $interrupted) $false 'First install recovery record consumed'
    Assert-Equal $global:ivlFixtureActiveApps 'other' 'An interrupted first install restores registration offline'
    $global:ivlFixtureOffline = $false
    Write-Output 'PASS offline recovery of an interrupted first install'

    Invoke-Installer 0 "-c|config custom_apps|probe|config custom_apps ivLyrics|config custom_apps|-n apply|apply:$Version|protocol|launch"
    Assert-Version $Version
    Invoke-Installer 0 '-c|config custom_apps|protocol'
    Write-Output 'PASS clean install and version check'

    $versionFile = Join-Path $app 'version.txt'
    New-Item -ItemType Directory -Path $interrupted | Out-Null
    Move-Item -LiteralPath $app -Destination (Join-Path $interrupted 'previous')
    Set-Content -LiteralPath (Join-Path $interrupted 'previous/version.txt') -Value $originalVersion -Encoding Ascii
    Copy-Item -LiteralPath (Join-Path $interrupted 'previous') -Destination $app -Recurse
    Set-Content -LiteralPath $versionFile -Value $Version -Encoding Ascii
    Set-Content -LiteralPath (Join-Path $interrupted 'before') -Value '1 1' -Encoding Ascii
    New-Item -ItemType File -Path (Join-Path $interrupted 'apply-started') | Out-Null
    Invoke-Uninstaller 1 '-c'
    Assert-Version $Version
    Assert-Equal (Test-Path -LiteralPath $interrupted) $true 'Removal preserved installer recovery state'
    $global:ivlFixtureOffline = $true
    Invoke-Installer 1 "-c|probe|-n apply|apply:$originalVersion"
    Assert-Version $originalVersion
    Assert-Equal (Test-Path -LiteralPath $interrupted) $false 'Upgrade recovery record consumed'
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'An interrupted upgrade preserves registration offline'
    $global:ivlFixtureOffline = $false
    Write-Output 'PASS offline recovery of an interrupted upgrade'

    $newerVersion = '900.0.0'
    Set-Content -LiteralPath $versionFile -Value $newerVersion -Encoding Ascii
    $global:ivlFixtureUseProxy = $true
    Invoke-Installer 0 '-c'
    Assert-Version $newerVersion
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'A lagging release preserves the installed configuration'
    Write-Output 'PASS a lagging release leaves the newer installation intact'
    Invoke-Installer 0 "-c|config custom_apps|probe|-n apply|apply:$Version|protocol|launch" -Force
    Assert-Version $Version
    $global:ivlFixtureUseProxy = $false
    Write-Output 'PASS forced reinstall uses the verified proxy archive'

    Test-RegisteredUpdaterProfile
    Write-Output 'PASS registered updater retains the selected profile and state paths'

    Set-Content -LiteralPath $versionFile -Value $originalVersion -Encoding Ascii
    $global:ivlFixtureGitHubDownloadFails = $true
    $global:ivlFixtureProxyVersion = $originalVersion
    Invoke-Installer 1 '-c'
    Assert-Version $originalVersion
    $global:ivlFixtureProxyVersion = $Version
    $global:ivlFixtureProxyArtifact = $MirrorZip
    Invoke-Installer 1 '-c'
    Assert-Version $originalVersion
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'Wrong mirror checksum preserves registration'
    $global:ivlFixtureProxyArtifact = $null
    Write-Output 'PASS a same-version mirror must match the published checksum'
    Invoke-Installer 0 "-c|config custom_apps|probe|-n apply|apply:$Version|protocol|launch"
    Assert-Version $Version
    $global:ivlFixtureGitHubDownloadFails = $false
    $global:ivlFixtureProxyVersion = ''
    Write-Output 'PASS fallback after GitHub asset download failure'

    $marker = Join-Path $app 'existing.marker'
    New-Item -ItemType File -Path $marker | Out-Null
    $global:ivlFixtureActiveApps = 'other'
    $global:ivlFixtureArtifact = $BrokenZip
    $global:ivlFixtureFailApply = $true
    Invoke-Installer 1 "-c|config custom_apps|probe|config custom_apps ivLyrics|config custom_apps|-n apply|apply:$Version|config custom_apps ivLyrics-|config custom_apps|-n apply|apply:"
    Assert-Equal $global:ivlFixtureActiveApps 'other' 'Failed repair preserves other apps'
    Assert-Equal (Test-Path -LiteralPath $marker) $true 'Failed repair leaves the installed package'
    $global:ivlFixtureFailApply = $false
    Invoke-Installer 0 "-c|config custom_apps|probe|config custom_apps ivLyrics|config custom_apps|-n apply|apply:$Version|protocol"
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'Repair re-enables the installed app'
    Assert-Equal (Test-Path -LiteralPath $marker) $true 'Repair does not download or replace a valid package'
    $global:ivlFixtureArtifact = $CompleteZip
    Write-Output 'PASS missing custom app registration repaired in place'

    Remove-Item -LiteralPath (Join-Path $app 'startup.js') -Force
    Invoke-Installer 0 "-c|config custom_apps|probe|-n apply|apply:$Version|protocol|launch"
    Assert-Equal (Test-Path -LiteralPath (Join-Path $app 'startup.js')) $true 'Repaired startup entry'
    Write-Output 'PASS interrupted install repair'

    Set-Content -LiteralPath (Join-Path $app 'version.txt') -Value $originalVersion -Encoding Ascii
    New-Item -ItemType File -Path (Join-Path $app 'previous.marker') | Out-Null
    $global:ivlFixtureArtifact = $BrokenZip
    Invoke-Installer 1 '-c'
    Assert-Version $originalVersion
    Assert-Equal (Test-Path -LiteralPath (Join-Path $app 'previous.marker')) $true 'Previous installation after invalid archive'
    $global:ivlFixtureArtifact = $CompleteZip
    $global:ivlFixtureCorruptChecksum = $true
    Invoke-Installer 1 '-c'
    Assert-Version $originalVersion
    $global:ivlFixtureCorruptChecksum = $false
    Write-Output 'PASS package and checksum validation'

    $global:ivlFixtureFailApply = $true
    Invoke-Installer 1 "-c|config custom_apps|probe|-n apply|apply:$Version|-n apply|apply:$originalVersion"
    Assert-Version $originalVersion
    Assert-Equal (Test-Path -LiteralPath (Join-Path $app 'previous.marker')) $true 'Previous installation restored'
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'Existing configuration retained'
    Write-Output 'PASS upgrade rollback'

    $global:ivlFixtureFailApply = $false
    $global:ivlFixtureRejectRoute = $true
    Invoke-Installer 1 "-c|config custom_apps|probe|-n apply|apply:$Version|-n apply|apply:$originalVersion"
    Assert-Version $originalVersion
    Assert-Equal (Test-Path -LiteralPath (Join-Path $app 'previous.marker')) $true 'Previous app after route failure'
    $global:ivlFixtureRejectRoute = $false
    Write-Output 'PASS a route injection failure rolls back even with exit code zero'

    $global:ivlFixtureRejectApp = $true
    Invoke-Installer 1 "-c|config custom_apps|probe|-n apply|apply:$Version|-n apply|apply:$originalVersion"
    Assert-Version $originalVersion
    Assert-Equal (Test-Path -LiteralPath (Join-Path $app 'previous.marker')) $true 'Previous app after refresh failure'
    $global:ivlFixtureRejectApp = $false
    $global:ivlFixtureFailApply = $true
    Write-Output 'PASS a skipped app refresh rolls back even with exit code zero'

    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $junctionTarget = Join-Path $root 'old payload'
        [IO.Directory]::Move($app, $junctionTarget)
        New-Item -ItemType Junction -Path $app -Target $junctionTarget | Out-Null
        Invoke-Installer 1 "-c|config custom_apps|probe|-n apply|apply:$Version|-n apply|apply:$originalVersion"
        Assert-Equal ((Get-Item -LiteralPath $app).LinkType) 'Junction' 'Junction restored after rollback'
        $global:ivlFixtureFailApply = $false
        Invoke-Installer 0 "-c|config custom_apps|probe|-n apply|apply:$Version|protocol|launch"
        Assert-Version $Version
        Assert-Equal (Test-Path -LiteralPath (Join-Path $junctionTarget 'previous.marker')) $true 'Original junction target preserved'
        Write-Output 'PASS NTFS junction rollback and upgrade'
    }

    $beforeRemoval = (Get-Content -LiteralPath (Join-Path $app 'version.txt') -Raw).Trim()
    $global:ivlFixtureUninstallFailure = 'config-not-saved'
    Invoke-Uninstaller 1 '-c|probe|config custom_apps|config custom_apps ivLyrics-|config custom_apps|config custom_apps ivLyrics|config custom_apps'
    Assert-Version $beforeRemoval
    Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'The failed removal kept the original config'
    Write-Output 'PASS a silent config write failure aborts removal'
    foreach ($failure in @('exit-code', 'version-mismatch')) {
        $global:ivlFixtureUninstallFailure = $failure
        Invoke-Uninstaller 1 '-c|probe|config custom_apps|config custom_apps ivLyrics-|config custom_apps|apply|config custom_apps ivLyrics|config custom_apps|apply'
        Assert-Version $beforeRemoval
        Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'Removal restores the previous configuration'
        Write-Output "PASS removal retains installation after $failure"
    }
    $global:ivlFixtureUninstallFailure = ''

    $lockPath = Join-Path $customApps '.ivLyrics-install.lock'
    $lock = [IO.FileStream]::new($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite,
        [IO.FileShare]::None, 4096, [IO.FileOptions]::DeleteOnClose)
    try {
        Invoke-Uninstaller 1 '-c'
        Assert-Version $beforeRemoval
        Assert-Equal (Test-Path -LiteralPath $lockPath) $true 'Active installer still has the lock'
        Assert-Equal $global:ivlFixtureActiveApps 'other|ivLyrics' 'Locked profile still has its configuration'
    }
    finally { $lock.Dispose() }
    Invoke-Uninstaller 0 '-c|probe|config custom_apps|config custom_apps ivLyrics-|config custom_apps|apply'
    Assert-Equal (Test-Path -LiteralPath $app) $false 'Successful removal removes the app'
    Assert-Equal $global:ivlFixtureActiveApps 'other' 'Successful removal preserves other custom apps'
    Assert-Equal (Test-Path -LiteralPath $lockPath) $false 'Removal releases its lock'
    Write-Output 'PASS removal rejects an active installation and can be retried'
}
finally {
    [IO.Directory]::Delete($root, $true)
}
