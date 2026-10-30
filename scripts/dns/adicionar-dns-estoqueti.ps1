<#
  Cria no DNS interno (AD) o nome do Estoque de TI apontando para o IIS.

  O DNS interno nao hospeda a zona sferamultifranquias.com inteira (ela fica na
  GoDaddy): cada sistema interno tem uma zona propria com o nome completo, como
  painel.sferamultifranquias.com. Este script cria a zona do estoque copiando a
  replicacao da zona de referencia (painel) e um registro A no apice da zona.

  Idempotente: pode rodar de novo sem duplicar nada.

  Uso (PowerShell como Administrador, no servidor DNS ADMSERVIDOR2 ou em uma
  maquina com o RSAT de DNS):
    powershell -ExecutionPolicy Bypass -File .\adicionar-dns-estoqueti.ps1
#>
[CmdletBinding()]
param(
    [string]$Nome = 'estoqueti.sferamultifranquias.com',
    [string]$Ip = '172.18.0.33',
    [string]$ZonaDeReferencia = 'painel.sferamultifranquias.com',
    [string]$ServidorDns = 'admservidor2.sfera.wan'
)

$ErrorActionPreference = 'Stop'
Import-Module DnsServer

$referencia = Get-DnsServerZone -ComputerName $ServidorDns -Name $ZonaDeReferencia
Write-Host ("Zona de referencia {0}: integrada ao AD={1}, replicacao={2}" -f $referencia.ZoneName, $referencia.IsDsIntegrated, $referencia.ReplicationScope)

$zona = Get-DnsServerZone -ComputerName $ServidorDns -Name $Nome -ErrorAction SilentlyContinue
if ($zona) {
    Write-Host "Zona $Nome ja existe (mantida)."
} elseif ($referencia.IsDsIntegrated) {
    Add-DnsServerPrimaryZone -ComputerName $ServidorDns -Name $Nome -ReplicationScope $referencia.ReplicationScope -DynamicUpdate None
    Write-Host "Zona $Nome criada (integrada ao AD, replicacao $($referencia.ReplicationScope))."
} else {
    Add-DnsServerPrimaryZone -ComputerName $ServidorDns -Name $Nome -ZoneFile "$Nome.dns" -DynamicUpdate None
    Write-Host "Zona $Nome criada (arquivo $Nome.dns)."
}

$registro = Get-DnsServerResourceRecord -ComputerName $ServidorDns -ZoneName $Nome -Name '@' -RRType A -ErrorAction SilentlyContinue
if ($registro | Where-Object { $_.RecordData.IPv4Address.IPAddressToString -eq $Ip }) {
    Write-Host "Registro A $Nome -> $Ip ja existe (mantido)."
} else {
    if ($registro) {
        $registro | ForEach-Object { Remove-DnsServerResourceRecord -ComputerName $ServidorDns -ZoneName $Nome -InputObject $_ -Force }
        Write-Host 'Registro A anterior removido.'
    }
    Add-DnsServerResourceRecordA -ComputerName $ServidorDns -ZoneName $Nome -Name '@' -IPv4Address $Ip
    Write-Host "Registro A $Nome -> $Ip criado."
}

Write-Host "`nConferindo:"
Resolve-DnsName -Name $Nome -Server $ServidorDns -Type A -DnsOnly | Select-Object Name, IPAddress | Format-Table -AutoSize
