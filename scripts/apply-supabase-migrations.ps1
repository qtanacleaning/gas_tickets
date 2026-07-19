[CmdletBinding()]
param(
  [string]$ProjectRef,
  [string]$Profile = "qtana-gas-tickets"
)

$ErrorActionPreference = "Stop"

function Assert-LastCommand([string]$Message) {
  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

function Test-ProjectAccess([string]$ExpectedProjectRef, [string]$ProfileName) {
  $projectsJson = (& $supabase.Source projects list --profile $ProfileName --output-format json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -or -not $projectsJson.Trim()) {
    return $false
  }

  try {
    $parsed = $projectsJson | ConvertFrom-Json
    $projects = if ($parsed.projects) { @($parsed.projects) } else { @($parsed) }
    return [bool]($projects | Where-Object {
      $_.id -eq $ExpectedProjectRef -or
      $_.ref -eq $ExpectedProjectRef -or
      $_.project_ref -eq $ExpectedProjectRef
    } | Select-Object -First 1)
  } catch {
    return $false
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$supabase = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabase) {
  throw "Supabase CLI is not installed. Install it first, then rerun this script."
}

if (-not $ProjectRef) {
  $envPath = Join-Path $repoRoot ".env.local"
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env.local was not found. Pass -ProjectRef explicitly."
  }

  $urlLine = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' } |
    Select-Object -First 1

  if (-not $urlLine) {
    throw "NEXT_PUBLIC_SUPABASE_URL was not found in .env.local."
  }

  $supabaseUrl = ($urlLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if ($supabaseUrl -notmatch '^https://([a-zA-Z0-9-]+)\.supabase\.co/?$') {
    throw "Could not derive the Supabase project reference from NEXT_PUBLIC_SUPABASE_URL."
  }
  $ProjectRef = $Matches[1]
}

Write-Host "Supabase project: $ProjectRef" -ForegroundColor Cyan
Write-Host "Supabase CLI profile: $Profile" -ForegroundColor Cyan
Write-Host "Checking access to the Supabase project..."

if (-not (Test-ProjectAccess $ProjectRef $Profile)) {
  Write-Host "Profile '$Profile' is not logged in or cannot access project $ProjectRef." -ForegroundColor Yellow
  Write-Host "Your default Supabase profile will not be changed."
  Write-Host "Use an access token from the account that owns this project, or ask the owner to invite your account."
  $relogin = Read-Host "Type LOGIN to authenticate the '$Profile' profile"
  if ($relogin.Trim() -ne "LOGIN") {
    throw "Stopped before linking. No migrations were applied."
  }

  & $supabase.Source login --profile $Profile --name $Profile
  Assert-LastCommand "Supabase login failed."

  if (-not (Test-ProjectAccess $ProjectRef $Profile)) {
    throw "Profile '$Profile' still cannot access project $ProjectRef. Sign in as the project owner or request project access. No migrations were applied."
  }
}

$configPath = Join-Path $repoRoot "supabase\config.toml"
if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host "Initializing the local Supabase CLI configuration..." -ForegroundColor Cyan
  & $supabase.Source init --profile $Profile
  Assert-LastCommand "Could not initialize supabase/config.toml."
}

$linkPath = Join-Path (Join-Path $repoRoot "supabase\.temp") "project-ref"
$linkedRef = if (Test-Path -LiteralPath $linkPath) {
  (Get-Content -Raw -LiteralPath $linkPath).Trim()
} else {
  ""
}

if ($linkedRef -ne $ProjectRef) {
  Write-Host "Linking the repository to Supabase..." -ForegroundColor Cyan
  & $supabase.Source link --profile $Profile --project-ref $ProjectRef
  Assert-LastCommand "Could not link the Supabase project."
} else {
  Write-Host "Repository is already linked to the requested project." -ForegroundColor Green
}

Write-Host "Enter the Gas Tickets database password." -ForegroundColor Yellow
Write-Host "It is used only in memory and will be cleared when this script finishes."
$securePassword = Read-Host "Database password" -AsSecureString
$dbPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
if (-not $dbPassword) {
  throw "A database password is required. No migrations were applied."
}

# Supabase CLI 2.106 on Windows can misread the named API-profile selector during
# database commands. Hide only that selector while db push runs, then restore it.
$profileSelectorPath = Join-Path $HOME ".supabase\profile"
$profileSelectorBackup = if (Test-Path -LiteralPath $profileSelectorPath) {
  [System.IO.File]::ReadAllBytes($profileSelectorPath)
} else {
  $null
}

try {
  $env:SUPABASE_DB_PASSWORD = $dbPassword
  if ($profileSelectorBackup) {
    Remove-Item -LiteralPath $profileSelectorPath -Force
  }

  Write-Host "Previewing pending migrations..." -ForegroundColor Cyan
  & $supabase.Source db push --linked --dry-run
  Assert-LastCommand "Migration preview failed. No migrations were applied."

  Write-Host ""
  Write-Host "Review the migration list above carefully." -ForegroundColor Yellow
  $confirmation = Read-Host "Type APPLY to run these migrations"
  if ($confirmation.Trim() -ne "APPLY") {
    Write-Host "Cancelled. No migrations were applied." -ForegroundColor Yellow
    return
  }

  Write-Host "Applying migrations..." -ForegroundColor Cyan
  & $supabase.Source db push --linked
  Assert-LastCommand "Migration push failed. Review the Supabase CLI error above."

  Write-Host "Verifying local and remote migration history..." -ForegroundColor Cyan
  & $supabase.Source migration list --linked
  Assert-LastCommand "Migrations were pushed, but migration-history verification failed."

  Write-Host "Supabase migrations applied and verified successfully." -ForegroundColor Green
} finally {
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  $dbPassword = $null
  $securePassword = $null
  if ($profileSelectorBackup) {
    [System.IO.File]::WriteAllBytes($profileSelectorPath, $profileSelectorBackup)
  }
}
