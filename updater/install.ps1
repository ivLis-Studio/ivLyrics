# ivLyrics Installer for Windows
# Requires Windows PowerShell 5.1+ or PowerShell 7+

param(
    [switch]$Force,
    [switch]$Help,
    [Alias("v")]
    [switch]$Version,
    [switch]$FunctionsOnly
)

# --- Configuration ---
$REPO = "ivLis-Studio/ivLyrics"
$FINAL_APP_NAME = "ivLyrics"
$PROXY_URL = "https://ivlis.kr/ivLyrics/proxy.php"
$MAX_RETRIES = 3
$METADATA_TIMEOUT = 20
$ARCHIVE_TIMEOUT = 180
$SCRIPT_VERSION = "2.1.3"
$RELEASE_VERSION_PATTERN = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

# --- Colors ---
$script:Colors = @{
    Primary = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error   = "Red"
    Muted   = "DarkGray"
    White   = "White"
    Magenta = "Magenta"
}

# --- Helper Functions ---
function Write-Colored {
    param([string]$Text, [string]$Color = "White", [switch]$NoNewLine)
    if ($NoNewLine) {
        Write-Host $Text -ForegroundColor $Color -NoNewline
    }
    else {
        Write-Host $Text -ForegroundColor $Color
    }
}

function Write-Logo {
    $logo = @"

    d8b          888                        d8b
    Y8P          888                        Y8P
                 888
    888 888  888 888      888  888 888d888 888  .d8888b .d8888b
    888 888  888 888      888  888 888P"   888 d88P"    88K
    888 Y88  88P 888      888  888 888     888 888      "Y8888b.
    888  Y8bd8P  888      Y88b 888 888     888 Y88b.         X88
    888   Y88P   88888888  "Y88888 888     888  "Y8888P  88888P'
                               888
                          Y8b d88P     for Spotify
                           "Y88P"

"@
    Write-Colored $logo $Colors.Primary
}

function Write-HelpMessage {
    Write-Host ""
    Write-Colored "ivLyrics Installer" $Colors.Primary
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Force      Force reinstall even if already up to date"
    Write-Host "  -Help       Show this help message"
    Write-Host "  -Version    Show installer version"
    Write-Host ""
    exit 0
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Colored "  >> $Title" $Colors.White
    Write-Colored "  $("-" * 50)" $Colors.Muted
}

function Write-Step {
    param(
        [int]$Current,
        [int]$Total,
        [string]$Message,
        [string]$Status = "running"
    )

    $icon = switch ($Status) {
        "running" { "[*]" }
        "success" { "[+]" }
        "warning" { "[!]" }
        "error" { "[x]" }
        default { "[ ]" }
    }

    $color = switch ($Status) {
        "running" { $Colors.Primary }
        "success" { $Colors.Success }
        "warning" { $Colors.Warning }
        "error" { $Colors.Error }
        default { $Colors.White }
    }

    $progress = "($Current/$Total)"
    Write-Colored "     $icon " $color -NoNewLine
    Write-Colored "$progress " $Colors.Muted -NoNewLine
    Write-Colored $Message $Colors.White
}

function Write-SubStep {
    param([string]$Message, [string]$Type = "info")

    $color = switch ($Type) {
        "success" { $Colors.Success }
        "warning" { $Colors.Warning }
        "error" { $Colors.Error }
        default { $Colors.Muted }
    }

    Write-Colored "             $Message" $color
}

function Write-ProgressBar {
    param([int]$Percent, [int]$Width = 30)

    $filled = [math]::Floor($Width * $Percent / 100)
    $empty = $Width - $filled

    $bar = "[" + ("=" * $filled) + ("." * $empty) + "]"

    Write-Host "`r             $bar $Percent%" -NoNewline
}

function Write-Success {
    param([string]$Version, [bool]$IsUpdate)

    $action = if ($IsUpdate) { "updated" } else { "installed" }
    $successMessage = ("     ivLyrics has been $action successfully!").PadRight(50)

    $box = @"

    +--------------------------------------------------+
    |                                                  |
    |$successMessage|
    |                                                  |
    |     Spotify will now open with ivLyrics.         |
    |                                                  |
    +--------------------------------------------------+

"@
    Write-Colored $box $Colors.Success
}

function Write-Footer {
    param([string]$Version)
    Write-Host ""
    Write-Colored "  Version: $Version" $Colors.Muted
    Write-Colored "  GitHub:  github.com/ivLis-Studio/ivLyrics" $Colors.Muted
    Write-Host ""
}

function Get-CurrentVersion {
    param([string]$AppDir)
    $versionFile = Join-Path $AppDir "version.txt"
    if (Test-Path -LiteralPath $versionFile -PathType Leaf) {
        return ([string](Get-Content -LiteralPath $versionFile -Raw -ErrorAction Stop)).Trim()
    }
    return $null
}

function Get-NormalizedVersion {
    param([AllowNull()][string]$Version)
    return (($Version -replace '\s', '') -replace '^[vV]', '')
}

function Test-IvLyricsVersionIsNewer {
    param([string]$InstalledVersion, [string]$ReleaseVersion)
    $installedParts = $InstalledVersion.Split('.')
    $releaseParts = $ReleaseVersion.Split('.')
    for ($index = 0; $index -lt 3; $index++) {
        $installed = $installedParts[$index]
        $remote = $releaseParts[$index]
        if ($installed.Length -ne $remote.Length) {
            return $installed.Length -gt $remote.Length
        }
        if ($installed -cne $remote) {
            return [string]::CompareOrdinal($installed, $remote) -gt 0
        }
    }
    return $false
}

function Test-SpicetifyInstalled {
    try {
        $null = Get-Command spicetify -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Test-NetworkConnection {
    try {
        $null = Invoke-WebRequest -Uri "https://api.github.com" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $true
    }
    catch {
        try {
            $null = Invoke-WebRequest -Uri $PROXY_URL -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            return $true
        }
        catch {
            return $false
        }
    }
}

function Get-IvLyricsInstallerTempDirectory {
    # Keep a valid custom TEMP/TMP setting, but fall back to the Windows
    # known-folder API when an environment variable contains a stale DOS 8.3
    # path (for example C:\Users\JAMIEG~1).
    $candidates = @($env:TEMP, $env:TMP)
    try {
        $candidates += [IO.Path]::GetTempPath()
    }
    catch {
        # GetTempPath can fail when TEMP/TMP points to an invalid short path.
    }

    $knownFolderTemp = $null
    try {
        $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
        if (-not [string]::IsNullOrWhiteSpace($localAppData) -and
            (Test-Path -LiteralPath $localAppData -PathType Container -ErrorAction SilentlyContinue)) {
            $knownFolderTemp = Join-Path $localAppData "Temp"
            $candidates += $knownFolderTemp
        }
    }
    catch {
        # Fall through to the validated environment candidates below.
    }

    $seenCandidates = @{}
    foreach ($candidate in @($candidates)) {
        try {
            if ([string]::IsNullOrWhiteSpace([string]$candidate)) {
                continue
            }
            $fullPath = [IO.Path]::GetFullPath(([string]$candidate).Trim().Trim('"'))
            if ($seenCandidates.ContainsKey($fullPath)) {
                continue
            }
            $seenCandidates[$fullPath] = $true

            if (-not (Test-Path -LiteralPath $fullPath -PathType Container -ErrorAction SilentlyContinue)) {
                $isKnownFolderFallback = -not [string]::IsNullOrWhiteSpace($knownFolderTemp) -and
                    $fullPath.Equals(
                        [IO.Path]::GetFullPath($knownFolderTemp),
                        [StringComparison]::OrdinalIgnoreCase
                    )
                if (-not $isKnownFolderFallback) {
                    continue
                }
                New-Item -ItemType Directory -Path $fullPath -Force -ErrorAction Stop | Out-Null
            }

            $probePath = Join-Path $fullPath (".ivlyrics-write-test-" + [Guid]::NewGuid().ToString("N") + ".tmp")
            try {
                [IO.File]::WriteAllText($probePath, "")
            }
            finally {
                if ([IO.File]::Exists($probePath)) {
                    [IO.File]::Delete($probePath)
                }
            }
            return $fullPath
        }
        catch {
            continue
        }
    }

    throw "Could not find a writable temporary directory. Check the Windows TEMP and TMP settings."
}

function Remove-IvLyricsInstallerTemporaryPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }
    if (Test-Path -LiteralPath $Path -ErrorAction SilentlyContinue) {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Test-Installation {
    param([string]$AppDir, [string]$Version)

    try {
        $manifestPath = Join-Path $AppDir "manifest.json"
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            return $false
        }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($manifest.name -ne $FINAL_APP_NAME -or (Get-NormalizedVersion (Get-CurrentVersion $AppDir)) -ne $Version) {
            return $false
        }

        $root = [IO.Path]::GetFullPath($AppDir).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $requiredFiles = @("index.js", "style.css") + @($manifest.subfiles) + @($manifest.subfiles_extension)
        foreach ($file in $requiredFiles) {
            if ($null -eq $file) { continue }
            $filePath = [IO.Path]::GetFullPath((Join-Path $AppDir $file))
            if (-not $filePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $filePath -PathType Leaf) -or
                (Get-Item -LiteralPath $filePath -ErrorAction Stop).Length -eq 0) {
                return $false
            }
        }
        return $true
    }
    catch {
        return $false
    }
}

function ConvertFrom-IvLyricsInstallerTerminalText {
    param($Value)

    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return ""
    }

    $escape = [regex]::Escape([string][char]27)
    $text = [regex]::Replace($text, "${escape}\[[0-?]*[ -/]*[@-~]", "")
    $text = [regex]::Replace($text, "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "")
    return $text.Trim()
}

function Invoke-IvLyricsSpicetifyCommand {
    param([string[]]$Arguments = @())

    # Spicetify emits UTF-8 output, while Windows PowerShell 5.1 can decode
    # redirected native output with the active console code page. Temporarily
    # align the encodings so non-ASCII user-profile paths remain intact.
    $utf8Encoding = [Text.UTF8Encoding]::new($false)
    $previousInputEncoding = [Console]::InputEncoding
    $previousConsoleOutputEncoding = [Console]::OutputEncoding
    $previousOutputEncoding = $OutputEncoding
    $previousErrorActionPreference = $ErrorActionPreference
    $commandOutput = @()
    $exitCode = -1

    try {
        [Console]::InputEncoding = $utf8Encoding
        [Console]::OutputEncoding = $utf8Encoding
        $OutputEncoding = $utf8Encoding
        # Windows PowerShell 5.1 wraps successful native stderr as an error
        # record. Preserve it as command output and rely on the native exit code.
        $ErrorActionPreference = "Continue"
        $commandOutput = @(& spicetify @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        $OutputEncoding = $previousOutputEncoding
        [Console]::InputEncoding = $previousInputEncoding
        [Console]::OutputEncoding = $previousConsoleOutputEncoding
    }

    return [PSCustomObject]@{
        Output = @($commandOutput)
        ExitCode = $exitCode
    }
}

function Resolve-SpicetifyInstallerConfigPath {
    param([object[]]$Output)

    foreach ($rawLine in @($Output)) {
        $plainText = ConvertFrom-IvLyricsInstallerTerminalText -Value $rawLine
        if ([string]::IsNullOrWhiteSpace($plainText)) {
            continue
        }
        $candidate = $plainText.Trim().Trim('"')

        try {
            $fullPath = [IO.Path]::GetFullPath($candidate)
            if ([IO.Path]::GetExtension($fullPath) -ine ".ini") {
                continue
            }
            if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                return $fullPath
            }
        }
        catch {
            continue
        }
    }

    throw "Spicetify returned no existing config file path."
}

function Get-SpicetifyInstallerCustomAppsDir {
    $result = Invoke-IvLyricsSpicetifyCommand -Arguments @("-c")
    $configOutput = @($result.Output)
    $exitCode = $result.ExitCode
    if ($exitCode -ne 0) {
        throw "Could not resolve the active Spicetify config file (exit $exitCode): $($configOutput -join [Environment]::NewLine)"
    }

    $configPath = Resolve-SpicetifyInstallerConfigPath -Output $configOutput
    $configDir = Split-Path -Parent $configPath
    if ([string]::IsNullOrWhiteSpace($configDir)) {
        throw "Could not determine the active Spicetify config directory from: $configPath"
    }
    return Join-Path $configDir "CustomApps"
}

function Get-SpicetifyInstallerAppDir {
    return Join-Path (Get-SpicetifyInstallerCustomAppsDir) $FINAL_APP_NAME
}

function Get-IvLyricsInstallerPathEntry {
    param([string]$Path)
    $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $parentPath = Split-Path -Parent $fullPath
    $leafName = Split-Path -Leaf $fullPath
    if (-not (Test-Path -LiteralPath $parentPath -PathType Container)) {
        return $null
    }
    return @(
        Get-ChildItem -LiteralPath $parentPath -Force -ErrorAction Stop |
            Where-Object { $_.Name -ieq $leafName }
    ) | Select-Object -First 1
}

function Remove-IvLyricsInstallerPath {
    param([string]$Path)
    $entry = Get-IvLyricsInstallerPathEntry -Path $Path
    if ($null -ne $entry) {
        # Directory.Delete removes directory links without traversing their targets.
        [IO.Directory]::Delete($entry.FullName, $true)
    }
}

function Register-IvLyricsUpdaterProtocol {
    param([string]$AppDir)
    $registerScript = Join-Path $appDir "updater\windows\register-updater-protocol.ps1"

    if (-not (Test-Path -LiteralPath $registerScript)) {
        Write-SubStep "Updater protocol script not found, skipping" "warning"
        return $false
    }

    try {
        $registrationOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $registerScript -AppDir $appDir 2>&1)
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "Registration script exited with code ${exitCode}: $($registrationOutput -join [Environment]::NewLine)"
        }
        Write-SubStep "Updater protocol registered" "success"
        return $true
    }
    catch {
        Write-SubStep "Updater protocol registration failed: $($_.Exception.Message)" "error"
        return $false
    }
}

function Invoke-WithRetry {
    param(
        [ScriptBlock]$ScriptBlock,
        [int]$MaxRetries = 3,
        [int]$DelaySeconds = 2
    )

    $attempt = 0
    $lastError = $null

    while ($attempt -lt $MaxRetries) {
        $attempt++
        try {
            return & $ScriptBlock
        }
        catch {
            $lastError = $_
            if ($attempt -lt $MaxRetries) {
                Write-SubStep "Attempt $attempt failed. Retrying in ${DelaySeconds}s..." "warning"
                Start-Sleep -Seconds $DelaySeconds
            }
        }
    }

    throw $lastError
}

function Get-IvLyricsRelease {
    try {
        $release = Invoke-WithRetry -MaxRetries $MAX_RETRIES -ScriptBlock {
            $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest" -TimeoutSec $METADATA_TIMEOUT -ErrorAction Stop
            $archive = @($response.assets | Where-Object { $_.name -eq "ivLyrics.zip" }) | Select-Object -First 1
            $checksum = @($response.assets | Where-Object { $_.name -eq "ivLyrics.zip.sha256" }) | Select-Object -First 1
            if (-not $archive.browser_download_url -or -not $checksum.browser_download_url -or
                (Get-NormalizedVersion $response.tag_name) -notmatch $RELEASE_VERSION_PATTERN) {
                throw "Verified release archive is unavailable"
            }
            return @{
                Url         = $archive.browser_download_url
                ChecksumUrl = $checksum.browser_download_url
                Version     = $response.tag_name
            }
        }
        Write-SubStep "Found version: $($release.Version) (via GitHub)" "success"
        return $release
    }
    catch {
        Write-SubStep "GitHub unavailable, trying proxy..." "warning"
    }

    return Get-IvLyricsProxyRelease
}

function Get-IvLyricsProxyRelease {
    param([string]$ExpectedVersion, [string]$ExpectedChecksum)

    $release = Invoke-WithRetry -MaxRetries $MAX_RETRIES -ScriptBlock {
        $response = Invoke-RestMethod -Uri "$PROXY_URL`?action=version" -TimeoutSec $METADATA_TIMEOUT -ErrorAction Stop
        $version = Get-NormalizedVersion $response.tag_name
        if (-not $response.zip_available -or "$($response.sha256)" -notmatch '^[a-fA-F0-9]{64}$' -or
            $version -notmatch $RELEASE_VERSION_PATTERN) {
            throw "Verified release archive is unavailable from the proxy"
        }
        if ($ExpectedVersion -and $version -ne $ExpectedVersion) {
            throw "Proxy offers $version, but GitHub selected $ExpectedVersion."
        }
        $checksum = ([string]$response.sha256).ToLowerInvariant()
        if ($ExpectedChecksum -and $checksum -ne $ExpectedChecksum) {
            throw "Proxy checksum does not match the GitHub release."
        }
        return @{
            Url      = "$PROXY_URL`?action=download"
            Checksum = $checksum
            Version  = $response.tag_name
        }
    }
    Write-SubStep "Found version: $($release.Version) (via proxy)" "success"
    return $release
}

function Read-IvLyricsReleaseChecksum {
    param([string]$Url, [string]$ChecksumPath)

    Invoke-WithRetry -MaxRetries $MAX_RETRIES -ScriptBlock {
        Remove-Item -LiteralPath $ChecksumPath -Force -ErrorAction SilentlyContinue
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $Url -OutFile $ChecksumPath -TimeoutSec $METADATA_TIMEOUT -UseBasicParsing -ErrorAction Stop
        $checksumText = Get-Content -LiteralPath $ChecksumPath -Raw -ErrorAction Stop
        $checksumMatch = [regex]::Match($checksumText, '\A([a-fA-F0-9]{64})(?=\s|\z)')
        if (-not $checksumMatch.Success) {
            throw "Release checksum file is invalid"
        }
        return $checksumMatch.Groups[1].Value.ToLowerInvariant()
    }
}

function Save-IvLyricsReleaseArchive {
    param([string]$Url, [string]$ArchivePath, [string]$ExpectedChecksum)

    if ($ExpectedChecksum -notmatch '^[a-f0-9]{64}$') {
        throw "Release checksum is missing or invalid"
    }

    Invoke-WithRetry -MaxRetries $MAX_RETRIES -ScriptBlock {
        for ($i = 0; $i -le 80; $i += 20) {
            Write-ProgressBar $i
            Start-Sleep -Milliseconds 50
        }
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $Url -OutFile $ArchivePath -TimeoutSec $ARCHIVE_TIMEOUT -UseBasicParsing -ErrorAction Stop
        if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf) -or
            (Get-Item -LiteralPath $ArchivePath).Length -lt 1000) {
            throw "Download failed or file too small"
        }

        if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256 -ErrorAction Stop).Hash -ine $ExpectedChecksum) {
            throw "Release checksum verification failed"
        }
    }
}

function Expand-IvLyricsRelease {
    param([hashtable]$Release, [string]$Destination)

    $tempRoot = Join-Path (Split-Path -Parent $Destination) "download"
    try {
        New-Item -ItemType Directory -Path $tempRoot -ErrorAction Stop | Out-Null
        $archivePath = Join-Path $tempRoot "ivLyrics.zip"
        $checksumPath = Join-Path $tempRoot "ivLyrics.zip.sha256"
        $checksum = $Release.Checksum
        try {
            if ($Release.ChecksumUrl) {
                $checksum = Read-IvLyricsReleaseChecksum -Url $Release.ChecksumUrl -ChecksumPath $checksumPath
            }
            Save-IvLyricsReleaseArchive -Url $Release.Url -ArchivePath $archivePath -ExpectedChecksum $checksum
        }
        catch {
            if (-not $Release.ChecksumUrl) { throw }
            Write-SubStep "GitHub archive download failed, trying proxy..." "warning"
            $mirror = Get-IvLyricsProxyRelease -ExpectedVersion (Get-NormalizedVersion $Release.Version) -ExpectedChecksum $checksum
            Save-IvLyricsReleaseArchive -Url $mirror.Url -ArchivePath $archivePath -ExpectedChecksum $mirror.Checksum
        }
        Write-ProgressBar 100
        Write-Host ""
        Write-SubStep "Download complete" "success"

        Expand-Archive -LiteralPath $archivePath -DestinationPath $Destination -Force -ErrorAction Stop
        $appDir = Join-Path $Destination $FINAL_APP_NAME
        if (-not (Test-Path -LiteralPath $appDir -PathType Container)) {
            $legacyDir = @(Get-ChildItem -LiteralPath $Destination -Directory -ErrorAction Stop)
            if ($legacyDir.Count -ne 1) {
                throw "Could not find the ivLyrics directory in the archive"
            }
            $appDir = $legacyDir[0].FullName
        }
        if (-not (Test-Installation -AppDir $appDir -Version (Get-NormalizedVersion $Release.Version))) {
            throw "The archive is missing required files or its version does not match $($Release.Version)."
        }
        Write-SubStep "Extracted release verified" "success"
        return $appDir
    }
    finally {
        Remove-IvLyricsInstallerTemporaryPath -Path $tempRoot
    }
}

function Invoke-IvLyricsSpicetify {
    param([string[]]$Arguments)
    $result = Invoke-IvLyricsSpicetifyCommand -Arguments $Arguments
    $output = $result.Output -join [Environment]::NewLine
    # Spicetify can skip a custom app and still report success.
    $appRejected = $Arguments[-1] -eq "apply" -and (
        $output.Contains("Spotify version mismatch with Spicetify.") -or
        $output.Contains('Custom app "' + $FINAL_APP_NAME + '" not found') -or
        $output.Contains('Custom app "' + $FINAL_APP_NAME + '" does not have index.js')
    )
    if ($result.ExitCode -ne 0 -or $appRejected) {
        throw "spicetify $($Arguments -join ' ') failed: $output"
    }
    return $result.Output
}

function Stop-IvLyricsSpotify {
    if (-not (Get-Process -Name "Spotify" -ErrorAction SilentlyContinue)) {
        Write-SubStep "Spotify is not running" "success"
        return
    }
    Write-SubStep "Spotify is running, closing..." "warning"
    Stop-Process -Name "Spotify" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Get-Process -Name "Spotify" -ErrorAction SilentlyContinue) {
        throw "Could not close Spotify. Close it and retry."
    }
    Write-SubStep "Spotify closed" "success"
}

function Test-IvLyricsRegistered {
    $configuredApps = @(
        Invoke-IvLyricsSpicetify -Arguments @("config", "custom_apps") |
            ForEach-Object { ConvertFrom-IvLyricsInstallerTerminalText -Value $_ }
    ) -join '|'
    return ($configuredApps -split '\|') -contains $FINAL_APP_NAME
}

function Set-IvLyricsRegistration {
    param([bool]$Registered)
    $argument = if ($Registered) { $FINAL_APP_NAME } else { "$FINAL_APP_NAME-" }
    $null = Invoke-IvLyricsSpicetify -Arguments @("config", "custom_apps", $argument)
    if ((Test-IvLyricsRegistered) -ne $Registered) {
        throw "The ivLyrics registration change was not saved in the Spicetify config."
    }
}

function Save-IvLyricsInstallState {
    param([string]$Stage, [bool]$HadApp, [bool]$Registered)
    $pending = Join-Path $Stage "before.next"
    [IO.File]::WriteAllText($pending, "$([int]$HadApp) $([int]$Registered)")
    [IO.File]::Move($pending, (Join-Path $Stage "before"))
}

function Complete-IvLyricsInstallRecovery {
    param([string]$Stage, [string]$AppDir, [switch]$Restart)
    $entry = Get-IvLyricsInstallerPathEntry -Path $Stage
    if ($null -eq $entry) { return }
    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Invalid installer recovery directory: $Stage"
    }

    $state = Join-Path $Stage "before"
    $previous = Join-Path $Stage "previous"
    $rejected = Join-Path $Stage "rejected"
    try {
        if ([IO.File]::Exists($state) -and -not [IO.File]::Exists((Join-Path $Stage "committed"))) {
            if ([IO.File]::ReadAllText($state) -notmatch '\A([01]) ([01])\r?\n?\z') {
                throw "Invalid installer recovery record"
            }
            $hadApp = $Matches[1] -eq '1'
            $registered = $Matches[2] -eq '1'
            $applyStarted = [IO.File]::Exists((Join-Path $Stage "apply-started"))
            if ($Restart -and $applyStarted) { Stop-IvLyricsSpotify }

            $current = Get-IvLyricsInstallerPathEntry -Path $AppDir
            if ($null -ne (Get-IvLyricsInstallerPathEntry -Path $previous)) {
                if ($null -ne $current) { [IO.Directory]::Move($AppDir, $rejected) }
                [IO.Directory]::Move($previous, $AppDir)
            }
            elseif ($hadApp) {
                if ($null -eq $current) { throw "The previous app directory is missing" }
            }
            elseif ($null -ne $current -and -not [IO.Directory]::Exists((Join-Path $Stage "incoming"))) {
                [IO.Directory]::Move($AppDir, $rejected)
            }

            if ([IO.File]::Exists((Join-Path $Stage "registration-started"))) {
                Set-IvLyricsRegistration -Registered $registered
            }
            if ($applyStarted) { $null = Invoke-IvLyricsSpicetify -Arguments @("-n", "apply") }
        }
    }
    catch {
        throw "Could not finish restoration. Recovery files: $Stage. $($_.Exception.Message)"
    }

    # Removing each link explicitly preserves its external target.
    Remove-IvLyricsInstallerPath -Path $previous
    Remove-IvLyricsInstallerPath -Path $rejected
    Remove-IvLyricsInstallerTemporaryPath -Path $Stage
    if (Test-Path -LiteralPath $Stage) { throw "Could not remove the completed recovery files at $Stage." }
}

function Invoke-IvLyricsInstallationApply {
    param([string]$Stage, [bool]$Registered, [bool]$IsUpdate)

    Write-Section "CONFIGURING"
    Write-Step 7 7 "Applying Spicetify configuration..." "running"
    if (-not $Registered) {
        [IO.File]::WriteAllText((Join-Path $Stage "registration-started"), "")
        Set-IvLyricsRegistration -Registered $true
    }
    Write-SubStep "Custom app registered" "success"

    [IO.File]::WriteAllText((Join-Path $Stage "apply-started"), "")
    try {
        $null = Invoke-IvLyricsSpicetify -Arguments @("-n", "apply")
    }
    catch {
        if ($IsUpdate) { throw }
        $null = Invoke-IvLyricsSpicetify -Arguments @("-n", "auto")
        $null = Invoke-IvLyricsSpicetify -Arguments @("-n", "apply")
    }

    [IO.File]::WriteAllText((Join-Path $Stage "committed"), "")
    Write-SubStep "Spicetify applied" "success"
}

function Repair-IvLyricsRegistration {
    param([string]$Stage, [string]$AppDir)
    Stop-IvLyricsSpotify
    New-Item -ItemType Directory -Path $Stage -ErrorAction Stop | Out-Null
    try {
        Save-IvLyricsInstallState -Stage $Stage -HadApp $true -Registered $false
        Invoke-IvLyricsInstallationApply -Stage $Stage -Registered $false -IsUpdate $true
    }
    finally {
        Complete-IvLyricsInstallRecovery -Stage $Stage -AppDir $AppDir
    }
    Write-SubStep "Spicetify registration repaired" "success"
}

function Install-IvLyricsApp {
    param([hashtable]$Release, [string]$Stage, [string]$AppDir, [bool]$IsUpdate)

    # Keep the staged payload and the old directory on the CustomApps volume.
    New-Item -ItemType Directory -Path $Stage -ErrorAction Stop | Out-Null
    try {
        $payload = Expand-IvLyricsRelease -Release $Release -Destination (Join-Path $Stage "extracted")
        $incoming = Join-Path $Stage "incoming"
        [IO.Directory]::Move($payload, $incoming)
        $original = Get-IvLyricsInstallerPathEntry -Path $AppDir
        if ($null -ne $original -and -not $original.PSIsContainer) {
            throw "The configured ivLyrics path is not a directory: $AppDir"
        }

        $registered = Test-IvLyricsRegistered
        Stop-IvLyricsSpotify
        Save-IvLyricsInstallState -Stage $Stage -HadApp ($null -ne $original) -Registered $registered
        if ($null -ne $original) {
            [IO.Directory]::Move($AppDir, (Join-Path $Stage "previous"))
        }
        [IO.Directory]::Move($incoming, $AppDir)
        Invoke-IvLyricsInstallationApply -Stage $Stage -Registered $registered -IsUpdate $IsUpdate
    }
    finally {
        Complete-IvLyricsInstallRecovery -Stage $Stage -AppDir $AppDir
    }
}

# --- Handle Command Line Arguments ---
if ($FunctionsOnly) {
    return
}

if ($Help) {
    Write-HelpMessage
}

if ($Version) {
    Write-Host "ivLyrics Installer v$SCRIPT_VERSION"
    exit 0
}

# --- Main Script ---
Clear-Host
Write-Logo

# Step 1: Check network connectivity
Write-Section "CHECKING REQUIREMENTS"
Write-Step 1 7 "Checking network connectivity..." "running"

$networkAvailable = Test-NetworkConnection
if ($networkAvailable) {
    Write-SubStep "Network connected" "success"
}
else {
    Write-SubStep "No network connection!" "warning"
}

# Step 2: Check Spicetify
Write-Step 2 7 "Checking Spicetify installation..." "running"

if (-not (Test-SpicetifyInstalled)) {
    if (-not $networkAvailable) { exit 1 }
    Write-SubStep "Spicetify is not installed!" "warning"
    Write-Host ""
    Write-Colored "  Spicetify is required to use ivLyrics." $Colors.Warning
    Write-Host ""
    Write-Colored "  Would you like to install Spicetify now? (Y/n): " $Colors.Primary -NoNewLine
    $installChoice = Read-Host

    if ($installChoice -eq '' -or $installChoice -eq 'y' -or $installChoice -eq 'Y') {
        Write-Host ""
        Write-SubStep "Installing Spicetify..." "info"
        Write-SubStep "This may take a minute..." "info"
        Write-Host ""

        $spicetifyInstallerPath = $null
        try {
            # Download and run Spicetify installer
            # Save to temp file and run separately to avoid pipeline parameter conflict
            $spicetifyInstallerPath = Join-Path (Get-IvLyricsInstallerTempDirectory) (
                "spicetify_install_" + [Guid]::NewGuid().ToString("N") + ".ps1"
            )
            Invoke-WebRequest -Uri "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" -UseBasicParsing -OutFile $spicetifyInstallerPath
            & $spicetifyInstallerPath

            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

            # Check again
            Start-Sleep -Seconds 2
            if (Test-SpicetifyInstalled) {
                Write-Host ""
                Write-SubStep "Spicetify installed successfully!" "success"
            }
            else {
                Write-Host ""
                Write-SubStep "Spicetify installation may require a terminal restart." "warning"
                Write-Colored "  Please restart PowerShell and run this script again." $Colors.Warning
                Write-Host ""
                exit 1
            }
        }
        catch {
            Write-Host ""
            Write-SubStep "Failed to install Spicetify automatically." "error"
            Write-Colored "  Please install manually:" $Colors.White
            Write-Colored "    iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex" $Colors.Primary
            Write-Host ""
            exit 1
        }
        finally {
            Remove-IvLyricsInstallerTemporaryPath -Path $spicetifyInstallerPath
        }
    }
    else {
        Write-Host ""
        Write-Colored "  Installation cancelled. Spicetify is required." $Colors.Muted
        Write-Host ""
        exit 1
    }
}
else {
    Write-SubStep "Spicetify found" "success"
}

# Step 3: Resolve the active Spicetify profile
Write-Step 3 7 "Finding the active Spicetify app directory..." "running"
try {
    $targetDir = Get-SpicetifyInstallerCustomAppsDir
    Write-SubStep "Using Spicetify app directory: $targetDir" "success"
}
catch {
    Write-SubStep "Could not locate the active config with 'spicetify -c'." "error"
    Write-SubStep $_.Exception.Message "error"
    exit 1
}

$lock = $null
try {
    # Step 4: Lock the active installation until its files and config agree.
    Write-Step 4 7 "Checking target directory..." "running"
    New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction Stop | Out-Null
    $lockPath = Join-Path $targetDir ".ivLyrics-install.lock"
    try {
        $lock = [IO.FileStream]::new(
            $lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite,
            [IO.FileShare]::None, 4096, [IO.FileOptions]::DeleteOnClose
        )
    }
    catch {
        throw "Could not lock the active ivLyrics installation at $lockPath. $($_.Exception.Message)"
    }
    Write-SubStep "Directory ready" "success"

    $appDir = Join-Path $targetDir $FINAL_APP_NAME
    $stage = Join-Path $targetDir ".ivLyrics-install.transaction"
    if ($null -ne (Get-IvLyricsInstallerPathEntry -Path $stage)) {
        Complete-IvLyricsInstallRecovery -Stage $stage -AppDir $appDir -Restart
        Write-SubStep "Recovered interrupted ivLyrics installation" "success"
    }
    if (-not $networkAvailable) { exit 1 }
    $currentVersion = Get-CurrentVersion $appDir
    $isUpdate = -not [string]::IsNullOrWhiteSpace($currentVersion)
    $mode = if ($isUpdate) { "UPDATING" } else { "INSTALLING" }
    $modeColor = if ($isUpdate) { $Colors.Warning } else { $Colors.Success }
    Write-Colored "                    [ $mode ]" $modeColor
    if ($isUpdate) {
        Write-Colored "              Current version: $currentVersion" $Colors.Muted
    }
    Write-Host ""

    # Step 5: Fetch version info
    Write-Section "DOWNLOADING"
    Write-Step 5 7 "Fetching latest version..." "running"
    $release = Get-IvLyricsRelease
    $latestVersion = Get-NormalizedVersion $release.Version
    $installedVersion = Get-NormalizedVersion $currentVersion
    if (-not $Force -and $installedVersion -match $RELEASE_VERSION_PATTERN -and
        (Test-IvLyricsVersionIsNewer -InstalledVersion $installedVersion -ReleaseVersion $latestVersion)) {
        Write-SubStep "Installed version $installedVersion is newer than the available release $latestVersion." "info"
        exit 0
    }

    if (-not $Force -and $installedVersion -eq $latestVersion -and
        (Test-Installation -AppDir $appDir -Version $latestVersion)) {
        Write-Host ""
        if (Test-IvLyricsRegistered) {
            Write-Colored "  Already up to date! (v$latestVersion)" $Colors.Success
            Write-Colored "  Use -Force to reinstall anyway." $Colors.Muted
        }
        else {
            Repair-IvLyricsRegistration -Stage $stage -AppDir $appDir
        }
        Write-SubStep "Checking updater protocol..." "info"
        if (-not (Register-IvLyricsUpdaterProtocol -AppDir $appDir)) {
            throw "Updater registration could not be repaired."
        }
        exit 0
    }

    # Step 6: Download and validate the package before touching the installation.
    Write-Step 6 7 "Downloading ivLyrics..." "running"
    Install-IvLyricsApp -Release $release -Stage $stage -AppDir $appDir -IsUpdate $isUpdate
    Write-SubStep "Registering updater protocol..." "info"
    if (-not (Register-IvLyricsUpdaterProtocol -AppDir $appDir)) {
        throw "ivLyrics was applied, but updater protocol registration failed. Run the installer again to retry registration."
    }
}
catch {
    Write-SubStep $_.Exception.Message "error"
    exit 1
}
finally {
    if ($null -ne $lock) { $lock.Dispose() }
}

Write-Success -Version $release.Version -IsUpdate $isUpdate
Write-Footer $release.Version
Start-Process "spotify://ivLyrics/?alert=Update%20Completed"
