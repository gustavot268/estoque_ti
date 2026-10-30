<#
  Configura o site do Estoque de TI no IIS como proxy reverso HTTPS.

    navegador --HTTPS--> IIS (este servidor) --HTTP--> nginx 172.18.0.12:8080 --> app

  O que faz (idempotente: pode rodar de novo sem duplicar nada):
    1. Confere se URL Rewrite e ARR estao instalados (se nao, para e avisa).
    2. Liga o proxy do ARR no servidor, se ainda estiver desligado.
    3. Localiza o certificado wildcard *.sfera.wan no repositorio do computador.
    4. Cria a pasta do site com o web.config (redireciona HTTP->HTTPS e faz o proxy).
    5. Cria o pool de aplicativos e o site "estoqueti" com bindings
       http/80 e https/443 (SNI) so para o nome publico.
    6. Testa /api/saude pelo proprio IIS.

  Nao altera nenhum outro site nem binding existente.

  Uso (PowerShell como Administrador, no servidor IIS):
    powershell -ExecutionPolicy Bypass -File .\configurar-site-estoqueti.ps1
  Parametros opcionais: -NomePublico, -Destino, -Pasta, -NomeDoSite e
  -Thumbprint (usa exatamente esse certificado, em My ou WebHosting).

  Ver docs/implantacao-vm.md, secao 3.
#>
[CmdletBinding()]
param(
    [string]$NomePublico = 'estoqueti.sferamultifranquias.com',
    [string]$Destino = 'http://172.18.0.12:8080',
    [string]$Pasta = 'C:\inetpub\estoqueti',
    [string]$NomeDoSite = 'estoqueti',
    [string]$Thumbprint = ''
)

$ErrorActionPreference = 'Stop'

function Etapa([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

# --- 0. Administrador ---------------------------------------------------------
$identidade = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Rode este script em um PowerShell aberto como Administrador.'
}
Import-Module WebAdministration

# --- 1. URL Rewrite e ARR -----------------------------------------------------
Etapa 'Conferindo URL Rewrite e Application Request Routing (ARR)'
$modulos = (Get-WebGlobalModule).Name
$faltando = @()
if ($modulos -notcontains 'RewriteModule') { $faltando += 'URL Rewrite 2.1 (https://www.iis.net/downloads/microsoft/url-rewrite)' }
if ($modulos -notcontains 'ApplicationRequestRouting') { $faltando += 'Application Request Routing 3.0 (https://www.iis.net/downloads/microsoft/application-request-routing)' }
if ($faltando.Count -gt 0) {
    Write-Host 'Instale antes de continuar (nesta ordem) e rode o script de novo:' -ForegroundColor Yellow
    $faltando | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 1
}
Write-Host 'OK: os dois modulos estao instalados.'

# --- 2. Proxy do ARR ----------------------------------------------------------
Etapa 'Conferindo o proxy do ARR (nivel do servidor)'
$proxyLigado = (Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled').Value
if ($proxyLigado) {
    Write-Host 'OK: o proxy ja estava ligado (nada alterado).'
} else {
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value $true
    Write-Host 'Proxy do ARR ligado.'
}

# --- 3. Certificado -----------------------------------------------------------
Etapa "Procurando certificado valido para $NomePublico"
$dominio = $NomePublico.Substring($NomePublico.IndexOf('.') + 1)
$candidatos = Get-ChildItem Cert:\LocalMachine\My, Cert:\LocalMachine\WebHosting -ErrorAction SilentlyContinue |
    Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) }
if ($Thumbprint) {
    $certificado = $candidatos | Where-Object { $_.Thumbprint -eq $Thumbprint.Replace(' ', '').ToUpper() } | Select-Object -First 1
} else {
    $certificado = $candidatos |
        Where-Object { $_.DnsNameList.Unicode -contains $NomePublico -or $_.DnsNameList.Unicode -contains "*.$dominio" } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1
}
if ($certificado) {
    $repositorio = $certificado.PSParentPath.Split('\')[-1]
    Write-Host ("OK: {0} em {1} (vence em {2:dd/MM/yyyy}, thumbprint {3})" -f $certificado.Subject, $repositorio, $certificado.NotAfter, $certificado.Thumbprint)
} elseif ($Thumbprint) {
    throw "Certificado $Thumbprint nao encontrado (com chave privada e dentro da validade) em My/WebHosting."
} else {
    # Sem certificado: o site sobe so com HTTP e o binding HTTPS fica para o
    # win-acme criar ao emitir o certificado (e atualizar nas renovacoes).
    Write-Host "Nenhum certificado para '$NomePublico' ainda: o binding HTTPS sera criado pelo win-acme." -ForegroundColor Yellow
}

# --- 4. Pasta e web.config ----------------------------------------------------
Etapa "Gravando $Pasta\web.config"
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<!-- Estoque de TI: proxy reverso para o nginx da stack Docker (gerado por configurar-site-estoqueti.ps1). -->
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="estoqueti-https" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
        <rule name="estoqueti-proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="$Destino/{R:1}" />
        </rule>
      </rules>
      <outboundRules>
        <!-- O ARR (reverseRewriteHostInResponseHeaders, opcao do servidor inteiro)
             troca o host de TODO Location pelo host do site, inclusive o redirect
             para o login da Microsoft. Esta regra devolve o host original, so
             neste site, sem mexer na opcao global usada pelos outros sites. -->
        <rule name="estoqueti-login-microsoft">
          <match serverVariable="RESPONSE_Location" pattern="^https?://[^/]+/([0-9a-fA-F-]{36}/oauth2/.*)$" />
          <action type="Rewrite" value="https://login.microsoftonline.com/{R:1}" />
        </rule>
      </outboundRules>
    </rewrite>
    <security>
      <requestFiltering>
        <!-- Fotos de ate 5 MB; o nginx aceita ate 10 MB. -->
        <requestLimits maxAllowedContentLength="10485760" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
"@
Set-Content -Path (Join-Path $Pasta 'web.config') -Value $webConfig -Encoding UTF8
Write-Host 'OK.'

# --- 5. Pool e site -----------------------------------------------------------
Etapa "Pool de aplicativos e site '$NomeDoSite'"
$caminhoDoPool = "IIS:\AppPools\$NomeDoSite"
if (-not (Test-Path $caminhoDoPool)) {
    New-WebAppPool -Name $NomeDoSite | Out-Null
    Write-Host "Pool '$NomeDoSite' criado."
}
# Sem .NET: o site so repassa requisicoes.
Set-ItemProperty $caminhoDoPool -Name managedRuntimeVersion -Value ''

if (-not (Get-Website -Name $NomeDoSite)) {
    New-Website -Name $NomeDoSite -PhysicalPath $Pasta -ApplicationPool $NomeDoSite -HostHeader $NomePublico -Port 80 | Out-Null
    Write-Host "Site '$NomeDoSite' criado com binding http/80 para $NomePublico."
} else {
    Write-Host "Site '$NomeDoSite' ja existia (mantido)."
}

if ($certificado) {
    if (-not (Get-WebBinding -Name $NomeDoSite -Protocol https -HostHeader $NomePublico)) {
        # SslFlags 1 = SNI: convive com outros sites HTTPS na porta 443.
        New-WebBinding -Name $NomeDoSite -Protocol https -Port 443 -HostHeader $NomePublico -SslFlags 1
        Write-Host "Binding https/443 (SNI) criado para $NomePublico."
    }
    $sslAtual = Get-ChildItem IIS:\SslBindings | Where-Object { $_.Host -eq $NomePublico -and $_.Port -eq 443 }
    if ($sslAtual -and $sslAtual.Thumbprint -eq $certificado.Thumbprint) {
        Write-Host 'OK: o binding HTTPS ja usa este certificado.'
    } else {
        if ($sslAtual) { Remove-Item "IIS:\SslBindings\!443!$NomePublico" }
        $bindingHttps = Get-WebBinding -Name $NomeDoSite -Protocol https -HostHeader $NomePublico
        $bindingHttps.AddSslCertificate($certificado.Thumbprint, $repositorio)
        Write-Host 'Certificado associado ao binding HTTPS.'
    }
}

if ((Get-WebsiteState -Name $NomeDoSite).Value -ne 'Started') {
    Start-Website -Name $NomeDoSite
}
$idDoSite = (Get-Website -Name $NomeDoSite).Id
Write-Host "OK: site '$NomeDoSite' iniciado (ID $idDoSite; use no --installationsiteid do win-acme)."

# --- 6. Teste -----------------------------------------------------------------
Etapa 'Testando o destino e o proprio IIS'
try {
    $direto = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "$Destino/nginx-saude"
    Write-Host "OK: nginx respondeu $($direto.StatusCode) em $Destino."
} catch {
    Write-Host "FALHA ao acessar $Destino a partir deste servidor: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Confira o firewall da VM 172.18.0.12 (porta 8080) e a rota entre os servidores.' -ForegroundColor Red
}

# curl.exe --resolve testa pelo nome publico mesmo sem o DNS criado ainda.
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl) {
    $resultado = & curl.exe -s -k --max-time 15 --resolve "${NomePublico}:443:127.0.0.1" "https://$NomePublico/api/saude"
    Write-Host "Resposta de https://$NomePublico/api/saude pelo IIS: $resultado"
}

Write-Host "`nEnderecos deste servidor (use para liberar a porta 8080 na VM do Docker):"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' } |
    ForEach-Object { Write-Host "  $($_.IPAddress) ($($_.InterfaceAlias))" }

Write-Host "`nPronto. Falta: registro DNS '$NomePublico' apontando para este servidor." -ForegroundColor Green
