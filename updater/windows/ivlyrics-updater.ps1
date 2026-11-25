param(
    [string]$Uri = "ivlyrics-updater://update",
    [string]$ProfileDirectory = ""
)

$ErrorActionPreference = "Stop"
$InstallerUrls = @(
    "https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1",
    "https://ghfast.top/https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1"
)

function Get-IvLyricsUpdaterLocalAppDataDirectory {
    $knownFolderPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if (-not [string]::IsNullOrWhiteSpace($knownFolderPath) -and
        (Test-Path -LiteralPath $knownFolderPath -PathType Container -ErrorAction SilentlyContinue)) {
        return [IO.Path]::GetFullPath($knownFolderPath)
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -and
        (Test-Path -LiteralPath $env:LOCALAPPDATA -PathType Container -ErrorAction SilentlyContinue)) {
        return [IO.Path]::GetFullPath($env:LOCALAPPDATA)
    }

    throw "Could not resolve the Windows Local AppData directory."
}

$UpdaterRoot = Join-Path (Get-IvLyricsUpdaterLocalAppDataDirectory) "ivLyrics\Updater"
$LogPath = Join-Path $UpdaterRoot "updater.log"

function Write-UpdaterLog {
    param([string]$Message)
    New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $Message
}

function Save-IvLyricsInstaller {
    param([Parameter(Mandatory = $true)][string]$DestinationPath)

    $lastError = $null
    for ($index = 0; $index -lt $InstallerUrls.Count; $index++) {
        $installerUrl = $InstallerUrls[$index]
        try {
            Invoke-WebRequest `
                -UseBasicParsing `
                -Uri $installerUrl `
                -OutFile $DestinationPath `
                -TimeoutSec 20 `
                -ErrorAction Stop

            $installerFile = Get-Item -LiteralPath $DestinationPath -ErrorAction Stop
            $hasInstallerMarker = Select-String `
                -LiteralPath $DestinationPath `
                -SimpleMatch "# ivLyrics Installer for Windows" `
                -Quiet
            if ($installerFile.Length -lt 512 -or -not $hasInstallerMarker) {
                throw "Downloaded installer is invalid."
            }

            if ($index -gt 0) {
                Write-UpdaterLog "Downloaded installer through the GitHub proxy."
            }
            return
        }
        catch {
            $lastError = $_
            Remove-Item -LiteralPath $DestinationPath -Force -ErrorAction SilentlyContinue
            if ($index + 1 -lt $InstallerUrls.Count) {
                Write-UpdaterLog "Direct GitHub download failed; trying the GitHub proxy."
            }
        }
    }

    throw $lastError
}

function Get-UpdaterAction {
    param([string]$RawUri)

    if ([string]::IsNullOrWhiteSpace($RawUri)) {
        return "update"
    }

    try {
        $parsed = [Uri]$RawUri
    }
    catch {
        throw "Invalid updater URI."
    }

    if ($parsed.Scheme -ne "ivlyrics-updater") {
        throw "Unsupported updater URI scheme."
    }

    $action = $parsed.Host
    if ([string]::IsNullOrWhiteSpace($action)) {
        $action = $parsed.AbsolutePath.Trim("/")
    }

    if ([string]::IsNullOrWhiteSpace($action)) {
        return "update"
    }

    $action = $action.ToLowerInvariant()
    switch ($action) {
        "update" { return "update" }
        "open-log" { return "open-log" }
        default { throw "Unsupported updater action: $action" }
    }
}

function Start-IvLyricsUpdate {
    Write-UpdaterLog "Starting ivLyrics update."

    $previousProfile = $env:SPICETIFY_CONFIG
    $previousState = $env:SPICETIFY_STATE
    $previousXdgState = $env:XDG_STATE_HOME
    $profileConfig = $null
    $registeredState = $null
    if (-not [string]::IsNullOrWhiteSpace($ProfileDirectory)) {
        $profileConfig = Join-Path $ProfileDirectory "config-xpui.ini"
        if (-not (Test-Path -LiteralPath $profileConfig -PathType Leaf)) {
            throw "The registered Spicetify config is missing: $profileConfig"
        }
        $profileStatePath = Join-Path $UpdaterRoot "spicetify-profile.json"
        if (Test-Path -LiteralPath $profileStatePath -PathType Leaf) {
            $registeredState = Get-Content -LiteralPath $profileStatePath -Raw | ConvertFrom-Json
            if (-not ([string]$registeredState.ProfileDirectory).Equals($ProfileDirectory, [StringComparison]::OrdinalIgnoreCase)) {
                throw "The registered Spicetify state belongs to a different profile. Install ivLyrics again to repair the updater."
            }
        }
    }

    # Keep the bootstrap installer under the canonical LocalAppData path rather
    # than TEMP, which can be a stale/nonexistent DOS 8.3 profile path.
    $tempRoot = Join-Path $UpdaterRoot ("Temp\" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot -ErrorAction Stop | Out-Null
    $installerPath = Join-Path $tempRoot "install.ps1"

    try {
        Write-UpdaterLog "Downloading official installer."
        Save-IvLyricsInstaller -DestinationPath $installerPath

        Write-UpdaterLog "Running installer."
        if ($profileConfig) {
            $env:SPICETIFY_CONFIG = $ProfileDirectory
        }
        if ($null -ne $registeredState) {
            $env:SPICETIFY_STATE = $registeredState.SpicetifyState
            $env:XDG_STATE_HOME = $registeredState.XdgStateHome
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath
        if ($LASTEXITCODE -ne 0) {
            throw "Installer exited with code $LASTEXITCODE."
        }

        Write-UpdaterLog "ivLyrics update completed."
    }
    finally {
        $env:SPICETIFY_CONFIG = $previousProfile
        $env:SPICETIFY_STATE = $previousState
        $env:XDG_STATE_HOME = $previousXdgState
        if (Test-Path -LiteralPath $tempRoot -ErrorAction SilentlyContinue) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    $action = Get-UpdaterAction -RawUri $Uri

    switch ($action) {
        "update" {
            Start-IvLyricsUpdate
            Start-Sleep -Seconds 2
        }
        "open-log" {
            New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
            if (-not (Test-Path -LiteralPath $LogPath)) {
                New-Item -ItemType File -Force -Path $LogPath | Out-Null
            }
            Start-Process notepad.exe -ArgumentList "`"$LogPath`""
        }
    }
}
catch {
    Write-UpdaterLog ("Update failed: " + $_.Exception.Message)
    Write-Host ""
    Write-Host "ivLyrics update failed. You can run the manual command instead:"
    Write-Host '$u="https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1"; try { iwr -useb -Uri $u -ErrorAction Stop | iex } catch { iwr -useb -Uri ("https://ghfast.top/" + $u) -ErrorAction Stop | iex }'
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}
