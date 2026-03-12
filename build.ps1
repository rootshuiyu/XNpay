$ErrorActionPreference = "Stop"

Write-Host "=== 犀牛支付 - 生产构建脚本 (Windows) ===" -ForegroundColor Cyan
Write-Host ""

$OutputDir = ".\dist"
$BackendDir = ".\backend"
$FrontendDir = ".\frontend"
$PublicKeyFile = ".\public.pem"

$TargetOS = if ($args[0]) { $args[0] } else { "linux" }
$TargetArch = if ($args[1]) { $args[1] } else { "amd64" }

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# ---- Step 1: Check tools ----
Write-Host "[1/6] Checking build tools..." -ForegroundColor Yellow

$garblePath = Get-Command garble -ErrorAction SilentlyContinue
if (-not $garblePath) {
    Write-Host "  Installing garble..."
    go install mvdan.cc/garble@latest
}

Write-Host "  garble: OK"
Write-Host "  go: $(go version)"

# ---- Step 2: Read public key ----
Write-Host "[2/6] Preparing license public key..." -ForegroundColor Yellow

$PubKeyContent = ""
if (Test-Path $PublicKeyFile) {
    $PubKeyContent = Get-Content $PublicKeyFile -Raw
    Write-Host "  Public key loaded."
} else {
    Write-Host "  WARNING: public.pem not found. License verification will be disabled." -ForegroundColor Red
    Write-Host "  Run: cd backend; go run cmd/license-tool/main.go -genkeys"
}

# ---- Step 3: Build frontend ----
Write-Host "[3/6] Building frontend..." -ForegroundColor Yellow

Push-Location $FrontendDir
npm ci --silent
npm run build
Pop-Location

if (Test-Path "$OutputDir\static") { Remove-Item -Recurse -Force "$OutputDir\static" }
Copy-Item -Recurse "$FrontendDir\dist" "$OutputDir\static"
Write-Host "  Frontend built and copied to dist\static\"

# ---- Step 4: Build Go binary with garble ----
Write-Host "[4/6] Building Go binary (garble + stripped)..." -ForegroundColor Yellow

Push-Location $BackendDir

$ldflags = "-s -w -X 'xinipay/internal/license.publicKeyPEM=$PubKeyContent'"

$env:CGO_ENABLED = "0"
$env:GOOS = $TargetOS
$env:GOARCH = $TargetArch

$binaryName = "xinipay"
if ($TargetOS -eq "windows") { $binaryName = "xinipay.exe" }

garble -literals -tiny -seed=random build -ldflags="$ldflags" -o "..\$OutputDir\$binaryName" ./cmd/server/

# Reset env
Remove-Item Env:GOOS -ErrorAction SilentlyContinue
Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue

Pop-Location
Write-Host "  Binary: $OutputDir\$binaryName"

# ---- Step 5: UPX compression ----
Write-Host "[5/6] UPX compression..." -ForegroundColor Yellow

$upxPath = Get-Command upx -ErrorAction SilentlyContinue
if ($upxPath) {
    upx --best --lzma "$OutputDir\$binaryName" 2>&1 | Out-Null
    Write-Host "  UPX compression done."
} else {
    Write-Host "  UPX not found, skipping."
}

# ---- Step 6: Build auxiliary tools ----
Write-Host "[6/6] Building auxiliary tools..." -ForegroundColor Yellow

Push-Location $BackendDir

$env:CGO_ENABLED = "0"
$env:GOOS = $TargetOS
$env:GOARCH = $TargetArch

$fpName = "fingerprint"
if ($TargetOS -eq "windows") { $fpName = "fingerprint.exe" }

go build -ldflags="-s -w" -o "..\$OutputDir\$fpName" ./cmd/fingerprint/

Remove-Item Env:GOOS -ErrorAction SilentlyContinue
Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue

Pop-Location
Write-Host "  Fingerprint tool: $OutputDir\$fpName"

# ---- Summary ----
Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host ""
Get-ChildItem $OutputDir | Format-Table Name, Length, LastWriteTime
Write-Host "IMPORTANT: Never deploy private.pem or license-tool to client servers!" -ForegroundColor Red
