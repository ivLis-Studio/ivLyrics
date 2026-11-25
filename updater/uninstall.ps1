# ivLyrics Uninstaller for Windows
# Requires Windows PowerShell 5.1+ or PowerShell 7+

# --- Configuration ---
$FINAL_APP_NAME = "ivLyrics"
$TARGET_DIRS = @(
    "$env:LOCALAPPDATA\spicetify\CustomApps\ivLyrics",
    "$env:APPDATA\spicetify\CustomApps\ivLyrics"
)
$UPDATER_ROOT = Join-Path $env:LOCALAPPDATA "ivLyrics\Updater"
$APP_DIRECTORY_STATE_PATH = Join-Path $UPDATER_ROOT "app-directory-state.json"

# --- Colors ---
$script:Colors = @{
    Primary   = "Cyan"
    Success   = "Green"
    Warning   = "Yellow"
    Error     = "Red"
    Muted     = "DarkGray"
    White     = "White"
}

# --- Helper Functions ---
function Write-Colored {
    param([string]$Text, [string]$Color = "White", [switch]$NoNewLine)
    if ($NoNewLine) {
        Write-Host $Text -ForegroundColor $Color -NoNewline
    } else {
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
                          Y8b d88P     UNINSTALLER
                           "Y88P"

"@
    Write-Colored $logo $Colors.Error
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
        "running"  { "[*]" }
        "success"  { "[+]" }
        "warning"  { "[!]" }
        "error"    { "[x]" }
        default    { "[ ]" }
    }

    $color = switch ($Status) {
        "running"  { $Colors.Primary }
        "success"  { $Colors.Success }
        "warning"  { $Colors.Warning }
        "error"    { $Colors.Error }
        default    { $Colors.White }
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
        "error"   { $Colors.Error }
        default   { $Colors.Muted }
    }

    Write-Colored "             $Message" $color
}

function Write-Complete {
    $box = @"

    +--------------------------------------------------+
    |                                                  |
    |     ivLyrics has been uninstalled successfully!  |
    |                                                  |
    |     Thank you for using ivLyrics.                |
    |                                                  |
    +--------------------------------------------------+

"@
    Write-Colored $box $Colors.Success
}

function Write-NotInstalled {
    $box = @"

    +--------------------------------------------------+
    |                                                  |
    |     ivLyrics is not installed on this system.    |
    |                                                  |
    +--------------------------------------------------+

"@
    Write-Colored $box $Colors.Warning
}

function ConvertFrom-IvLyricsUninstallerTerminalText {
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

function Resolve-SpicetifyUninstallerConfigPath {
    param([object[]]$Output)

    foreach ($rawLine in @($Output)) {
        $plainText = ConvertFrom-IvLyricsUninstallerTerminalText -Value $rawLine
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

function Get-SpicetifyConfiguredIvLyricsPath {
    if ($null -eq (Get-Command spicetify -ErrorAction SilentlyContinue)) {
        return $null
    }

    $result = Invoke-IvLyricsSpicetifyCommand -Arguments @("-c")
    $configOutput = @($result.Output)
    $exitCode = $result.ExitCode
    if ($exitCode -ne 0) {
        return $null
    }

    try {
        $configPath = Resolve-SpicetifyUninstallerConfigPath -Output $configOutput
        $configDir = Split-Path -Parent $configPath
        if ([string]::IsNullOrWhiteSpace($configDir)) {
            return $null
        }
        return Join-Path (Join-Path $configDir "CustomApps") $FINAL_APP_NAME
    }
    catch {
        return $null
    }
}

function Test-IvLyricsDirectoryIdentity {
    param([string]$Path)
    try {
        $manifestPath = Join-Path $Path "manifest.json"
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            return $false
        }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        return ([string]$manifest.name) -eq "ivLyrics"
    }
    catch {
        return $false
    }
}

function Get-IvLyricsUninstallerPathEntry {
    param([string]$Path)
    try {
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
    catch {
        return $null
    }
}

function Initialize-IvLyricsUninstallerNativeMethods {
    if ($null -ne ("IvLyrics.UninstallerNativeMethods" -as [type])) {
        return
    }
    Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;

namespace IvLyrics {
    public static class UninstallerNativeMethods {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "RemoveDirectoryW")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool RemoveDirectory(string path);
    }
}
"@
}

function Remove-IvLyricsUninstallerPath {
    param([string]$Path)
    $entry = Get-IvLyricsUninstallerPathEntry -Path $Path
    if ($null -eq $entry) {
        return $false
    }
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Initialize-IvLyricsUninstallerNativeMethods
        if (-not [IvLyrics.UninstallerNativeMethods]::RemoveDirectory([IO.Path]::GetFullPath($Path))) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Could not remove directory link '$Path' (error $errorCode)."
        }
    }
    else {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    }
    return $true
}

function Get-IvLyricsInstallDirectories {
    $directories = @()
    $configuredPath = Get-SpicetifyConfiguredIvLyricsPath
    if (-not [string]::IsNullOrWhiteSpace($configuredPath)) {
        $directories += $configuredPath
    }
    if (Test-Path -LiteralPath $APP_DIRECTORY_STATE_PATH -PathType Leaf) {
        try {
            $state = Get-Content -LiteralPath $APP_DIRECTORY_STATE_PATH -Raw | ConvertFrom-Json
            if (-not [string]::IsNullOrWhiteSpace([string]$state.ConfiguredPath)) {
                $directories += [string]$state.ConfiguredPath
            }
        }
        catch {
            Write-SubStep "Could not read the recorded app directory" "warning"
        }
    }
    $directories += @($TARGET_DIRS)
    return @($directories | Select-Object -Unique)
}

function Get-CurrentVersion {
    foreach ($dir in $script:InstallDirectories) {
        try {
            $versionFile = Join-Path $dir "version.txt"
            if (Test-Path -LiteralPath $versionFile -PathType Leaf) {
                return (Get-Content -LiteralPath $versionFile -Raw).Trim()
            }
        }
        catch {
            continue
        }
    }
    return $null
}

function Test-IvLyricsInstalled {
    foreach ($dir in $script:InstallDirectories) {
        if (Test-IvLyricsDirectoryIdentity -Path $dir) {
            return $true
        }
    }
    return $false
}

function Lock-IvLyricsInstallDirectories {
    # Match install.ps1's exclusive lock for every existing CustomApps directory being cleaned.
    $locks = [Collections.Generic.List[IO.FileStream]]::new()
    $lockedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $lockPath = $null
    try {
        foreach ($appDirectory in $script:InstallDirectories) {
            $parent = Split-Path -Parent $appDirectory
            if (-not $parent -or -not (Test-Path -LiteralPath $parent -PathType Container)) { continue }
            $lockPath = [IO.Path]::GetFullPath((Join-Path $parent ".ivLyrics-install.lock"))
            if ($lockedPaths.Add($lockPath)) {
                $locks.Add([IO.FileStream]::new(
                    $lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite,
                    [IO.FileShare]::None, 4096, [IO.FileOptions]::DeleteOnClose
                ))
                $recovery = Join-Path $parent ".ivLyrics-install.transaction"
                if ($null -ne (Get-IvLyricsUninstallerPathEntry -Path $recovery)) {
                    throw "Run the ivLyrics installer to recover the interrupted installation before removing it."
                }
            }
        }
        return $locks.ToArray()
    }
    catch {
        foreach ($lock in $locks) { $lock.Dispose() }
        throw "Could not lock the ivLyrics installation at $lockPath. $($_.Exception.Message)"
    }
}

function Invoke-IvLyricsUninstallerSpicetify {
    param([string[]]$Arguments)
    $result = Invoke-IvLyricsSpicetifyCommand -Arguments $Arguments
    $output = $result.Output -join [Environment]::NewLine
    $appRejected = $Arguments[-1] -eq 'apply' -and (
        $output.Contains('Spotify version mismatch with Spicetify.') -or
        $output.Contains('Custom app "' + $FINAL_APP_NAME + '" not found') -or
        $output.Contains('Custom app "' + $FINAL_APP_NAME + '" does not have index.js')
    )
    if ($result.ExitCode -ne 0 -or $appRejected) {
        throw "spicetify $($Arguments -join ' ') failed: $output"
    }
    return $result.Output
}

function Test-IvLyricsUninstallerRegistered {
    $configuredApps = @(
        Invoke-IvLyricsUninstallerSpicetify -Arguments @("config", "custom_apps") |
            ForEach-Object { ConvertFrom-IvLyricsUninstallerTerminalText -Value $_ }
    ) -join '|'
    return ($configuredApps -split '\|') -contains $FINAL_APP_NAME
}

function Set-IvLyricsUninstallerRegistration {
    param([bool]$Registered)
    $argument = if ($Registered) { $FINAL_APP_NAME } else { "$FINAL_APP_NAME-" }
    $null = Invoke-IvLyricsUninstallerSpicetify -Arguments @("config", "custom_apps", $argument)
    if ((Test-IvLyricsUninstallerRegistered) -ne $Registered) {
        throw "The ivLyrics registration change was not saved in the Spicetify config."
    }
}

function Remove-IvLyricsSpicetifyConfiguration {
    if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
        Write-SubStep "Spicetify not found, skipping..." "warning"
        return
    }

    if (-not (Test-IvLyricsUninstallerRegistered)) { return }

    $applyStarted = $false
    try {
        Set-IvLyricsUninstallerRegistration -Registered $false
        $applyStarted = $true
        $null = Invoke-IvLyricsUninstallerSpicetify -Arguments @("apply")
        Write-SubStep "Spicetify applied" "success"
    }
    catch {
        $configurationError = $_
        try {
            Set-IvLyricsUninstallerRegistration -Registered $true
            if ($applyStarted) {
                $null = Invoke-IvLyricsUninstallerSpicetify -Arguments @("apply")
            }
        }
        catch {
            Write-SubStep "Could not restore Spicetify config: $($_.Exception.Message)" "warning"
        }
        throw "Spicetify could not apply removal. The installed files were kept. $($configurationError.Exception.Message)"
    }
}

function Unregister-IvLyricsUpdaterProtocol {
    $protocolRoot = "HKCU:\Software\Classes\ivlyrics-updater"
    $pathUtilsScript = Join-Path $UPDATER_ROOT "updater-path-utils.ps1"

    $cleanupFailed = $false
    $hadAppDirectoryState = Test-Path -LiteralPath $APP_DIRECTORY_STATE_PATH -PathType Leaf
    try {
        if (Test-Path -LiteralPath $pathUtilsScript -PathType Leaf) {
            . $pathUtilsScript
            if (Remove-IvLyricsRecordedAppDirectory -StatePath $APP_DIRECTORY_STATE_PATH -IncludeSynchronizedDirectory) {
                Write-SubStep "Recorded Spicetify app directory removed" "success"
            }
        }
        elseif (Test-Path -LiteralPath $APP_DIRECTORY_STATE_PATH -PathType Leaf) {
            Write-SubStep "App directory cleanup helper was not found; recorded path was left untouched" "warning"
        }
    }
    catch {
        Write-SubStep "Could not remove the recorded Spicetify app directory" "warning"
        $cleanupFailed = $true
    }
    if ($hadAppDirectoryState -and (Test-Path -LiteralPath $APP_DIRECTORY_STATE_PATH -PathType Leaf)) {
        Write-SubStep "Recorded app directory state was preserved for recovery" "warning"
        $cleanupFailed = $true
    }

    try {
        if (Test-Path -LiteralPath $protocolRoot) {
            Remove-Item -LiteralPath $protocolRoot -Recurse -Force
            Write-SubStep "Updater protocol unregistered" "success"
        }
        else {
            Write-SubStep "Updater protocol was not registered" "info"
        }

        if (-not $cleanupFailed -and (Test-Path -LiteralPath $UPDATER_ROOT)) {
            Remove-Item -LiteralPath $UPDATER_ROOT -Recurse -Force
            Write-SubStep "Updater helper files removed" "success"
        }
    }
    catch {
        Write-SubStep "Could not unregister updater protocol" "warning"
        $cleanupFailed = $true
    }
    return -not $cleanupFailed
}

function Remove-IvLyricsInstallation {
    # Check if ivLyrics is installed
    if (-not (Test-IvLyricsInstalled)) {
        Write-Section "REMOVING UPDATER"
        Write-Step 1 1 "Removing updater protocol..." "running"
        if (-not (Unregister-IvLyricsUpdaterProtocol)) {
            Write-Colored "  Cleanup was incomplete. The recovery state was preserved." $Colors.Error
            exit 1
        }
        Write-NotInstalled
        exit 0
    }

    # Get current version
    $currentVersion = Get-CurrentVersion
    if ($currentVersion) {
        Write-Colored "              Installed version: $currentVersion" $Colors.Muted
    }
    Write-Host ""

    # Confirmation prompt
    Write-Colored "  Are you sure you want to uninstall ivLyrics? (y/N): " $Colors.Warning -NoNewLine
    $confirmation = Read-Host

    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Host ""
        Write-Colored "  Uninstallation cancelled." $Colors.Muted
        Write-Host ""
        exit 0
    }

    # Step 1: Close Spotify
    Write-Section "STOPPING SERVICES"
    Write-Step 1 4 "Checking Spotify process..." "running"

    $spotifyProcesses = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
    if ($spotifyProcesses) {
        Write-SubStep "Spotify is running, closing..." "warning"
        Stop-Process -Name "Spotify" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if (Get-Process -Name "Spotify" -ErrorAction SilentlyContinue) {
            throw "Could not close Spotify. Close it and retry."
        }
        Write-SubStep "Spotify closed" "success"
    } else {
        Write-SubStep "Spotify is not running" "success"
    }

    # Step 2: Remove from Spicetify config
    Write-Section "REMOVING CONFIGURATION"
    Write-Step 2 4 "Updating Spicetify configuration..." "running"
    Remove-IvLyricsSpicetifyConfiguration

    # Step 3: Remove updater protocol
    Write-Section "REMOVING UPDATER"
    Write-Step 3 4 "Removing updater protocol..." "running"
    $updaterCleanupFailed = -not (Unregister-IvLyricsUpdaterProtocol)

    # Step 4: Delete files
    Write-Section "REMOVING FILES"
    Write-Step 4 4 "Deleting ivLyrics files..." "running"

    $removedCount = 0
    $removalFailed = $false
    foreach ($dir in $script:InstallDirectories) {
        $entry = Get-IvLyricsUninstallerPathEntry -Path $dir
        if ($null -ne $entry -and (Test-IvLyricsDirectoryIdentity -Path $dir)) {
            try {
                Remove-IvLyricsUninstallerPath -Path $dir | Out-Null
                Write-SubStep "Removed: $dir" "success"
                $removedCount++
            } catch {
                $removalFailed = $true
                Write-SubStep "Failed to remove: $dir. $($_.Exception.Message)" "error"
            }
        }
    }

    if ($removedCount -eq 0) {
        Write-SubStep "No files to remove" "info"
    } else {
        Write-SubStep "Removed $removedCount location(s)" "success"
    }

    if ($updaterCleanupFailed -and (Test-Path -LiteralPath $APP_DIRECTORY_STATE_PATH -PathType Leaf)) {
        try {
            $remainingState = Get-Content -LiteralPath $APP_DIRECTORY_STATE_PATH -Raw | ConvertFrom-Json
            $remainingPath = [string]$remainingState.ConfiguredPath
            if (-not [string]::IsNullOrWhiteSpace($remainingPath) -and
                $null -eq (Get-IvLyricsUninstallerPathEntry -Path $remainingPath)) {
                Remove-Item -LiteralPath $UPDATER_ROOT -Recurse -Force -ErrorAction Stop
                $updaterCleanupFailed = $false
                Write-SubStep "Removed recovery state after app directory cleanup" "success"
            }
        }
        catch {
            Write-SubStep "Could not finalize updater recovery state cleanup" "warning"
        }
    }

    # Done with ivLyrics removal
    if ($removalFailed) {
        throw "One or more ivLyrics directories could not be removed. Run the uninstaller again to retry."
    }
    if ($updaterCleanupFailed) {
        Write-Colored "  ivLyrics files were removed, but updater path cleanup was incomplete." $Colors.Error
        Write-Colored "  Recovery state was preserved in: $APP_DIRECTORY_STATE_PATH" $Colors.Warning
        exit 1
    }
    Write-Complete
}

# --- Main Script ---
Clear-Host
Write-Logo
$script:InstallDirectories = @(Get-IvLyricsInstallDirectories)
$locks = @()
try {
    $locks = @(Lock-IvLyricsInstallDirectories)
    Remove-IvLyricsInstallation
}
catch {
    Write-SubStep $_.Exception.Message "error"
    exit 1
}
finally {
    foreach ($lock in $locks) { $lock.Dispose() }
}

# Ask about Spicetify removal
Write-Host ""
Write-Colored "  Would you also like to uninstall Spicetify completely? (y/N): " $Colors.Warning -NoNewLine
$spicetifyChoice = Read-Host

if ($spicetifyChoice -eq 'y' -or $spicetifyChoice -eq 'Y') {
    Write-Host ""
    Write-Section "REMOVING SPICETIFY"
    Write-Step 1 2 "Restoring Spotify to original state..." "running"

    try {
        $spicetifyExists = Get-Command spicetify -ErrorAction SilentlyContinue
        if ($spicetifyExists) {
            $restoreResult = Invoke-IvLyricsSpicetifyCommand -Arguments @("restore")
            $restoreOutput = @($restoreResult.Output)
            if ($restoreResult.ExitCode -ne 0) {
                throw "spicetify restore failed: $($restoreOutput -join [Environment]::NewLine)"
            }
            Write-SubStep "Spotify restored" "success"
        } else {
            Write-SubStep "Spicetify not found, skipping restore..." "warning"
        }
    } catch {
        Write-SubStep "Could not restore Spotify (may already be clean)" "warning"
    }

    Write-Step 2 2 "Removing Spicetify files..." "running"

    $spicetifyDirs = @(
        "$env:APPDATA\spicetify",
        "$env:LOCALAPPDATA\spicetify"
    )

    foreach ($dir in $spicetifyDirs) {
        if (Test-Path $dir) {
            try {
                Remove-Item $dir -Recurse -Force -ErrorAction Stop
                Write-SubStep "Removed: $dir" "success"
            } catch {
                Write-SubStep "Failed to remove: $dir" "error"
            }
        }
    }

    Write-Host ""
    $spicetifyBox = @"
    +--------------------------------------------------+
    |                                                  |
    |     Spicetify has been completely removed!       |
    |                                                  |
    +--------------------------------------------------+

"@
    Write-Colored $spicetifyBox $Colors.Success
}

Write-Colored "  GitHub:  github.com/ivLis-Studio/ivLyrics" $Colors.Muted
Write-Host ""
