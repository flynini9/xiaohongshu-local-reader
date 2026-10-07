$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot

if (-not $env:PORT) { $env:PORT = '3333' }
if (-not $env:CDP_ENDPOINT) { $env:CDP_ENDPOINT = 'http://127.0.0.1:9222' }

Write-Host "Starting local MCP server at http://127.0.0.1:$($env:PORT)/mcp"
Write-Host "Browser CDP endpoint: $($env:CDP_ENDPOINT)"
Write-Host "Leave XHS_READER_TOKEN empty when using loopback + OpenAI Secure MCP Tunnel."
node (Join-Path $pluginRoot 'scripts/server.mjs')
