param([int]$Limit = 0, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pythonPath = Join-Path $projectRoot '.venv-audio/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & python -m venv (Join-Path $projectRoot '.venv-audio')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment' }
}
& $pythonPath -c "import piper, lameenc, miniaudio"
if ($LASTEXITCODE -ne 0) {
    & $pythonPath -m pip install -r (Join-Path $PSScriptRoot 'audio-requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Could not install audio dependencies' }
}
$modelDirectory = Join-Path $projectRoot '.audio-models'
$modelPath = Join-Path $modelDirectory 'de_DE-thorsten-high.onnx'
if (-not (Test-Path -LiteralPath $modelPath) -or -not (Test-Path -LiteralPath "$modelPath.json")) {
    & $pythonPath -m piper.download_voices de_DE-thorsten-high --download-dir $modelDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Could not download the German voice' }
}
$generatorArguments = @((Join-Path $PSScriptRoot 'generate_audio.py'), '--limit', $Limit)
if ($VerifyOnly) { $generatorArguments += '--verify-only' }
& $pythonPath @generatorArguments
if ($LASTEXITCODE -ne 0) { throw 'Audio generation/verification failed; run again to resume' }
if ($Limit -eq 0) {
    & $pythonPath (Join-Path $PSScriptRoot 'verify_audio.py')
    if ($LASTEXITCODE -ne 0) { throw 'MP3 decoding verification failed' }
    if (-not $VerifyOnly) {
        & $pythonPath (Join-Path $PSScriptRoot 'install_site_audio.py')
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the site audio index and Flutter hooks' }
    }
}
