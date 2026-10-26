# Sobe o PostgreSQL local da demo (instalação nativa, sem Docker/serviço do Windows).
# Idempotente: se o servidor já estiver no ar, apenas confirma e sai.

$pgBin = "$env:LOCALAPPDATA\Programs\pgsql\bin"
$dataDir = "$env:LOCALAPPDATA\pgsql-data\estoque_ti"
$logFile = "$env:LOCALAPPDATA\pgsql-data\estoque_ti.log"

if (-not (Test-Path "$pgBin\pg_ctl.exe")) {
    Write-Error "PostgreSQL não encontrado em $pgBin. Reinstale os binários nativos antes de continuar."
    exit 1
}

if (-not (Test-Path $dataDir)) {
    Write-Error "Diretório de dados $dataDir não existe. É preciso rodar initdb novamente (o diretório já sumiu uma vez por limpeza de perfil)."
    exit 1
}

$status = & "$pgBin\pg_ctl.exe" -D $dataDir status
if ($LASTEXITCODE -eq 0) {
    Write-Output "PostgreSQL já está rodando."
    exit 0
}

& "$pgBin\pg_ctl.exe" -D $dataDir -l $logFile -o "-p 5432 -h 127.0.0.1" start
Start-Sleep -Seconds 2
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 5432
