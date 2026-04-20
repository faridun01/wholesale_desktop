param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$BearerToken,

  [int]$RequestsPerEndpoint = 30,
  [int]$TimeoutSec = 60
)

$ErrorActionPreference = 'Stop'

function Get-Percentile {
  param(
    [double[]]$Values,
    [double]$Percentile
  )
  if (-not $Values -or $Values.Count -eq 0) {
    return 0
  }
  $sorted = $Values | Sort-Object
  $index = [Math]::Ceiling(($Percentile / 100.0) * $sorted.Count) - 1
  if ($index -lt 0) { $index = 0 }
  if ($index -ge $sorted.Count) { $index = $sorted.Count - 1 }
  return [double]$sorted[$index]
}

$headers = @{
  Authorization = "Bearer $BearerToken"
}

$endpoints = @(
  "/api/reports/analytics?start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
  "/api/reports/sales?start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
  "/api/reports/profit?start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
  "/api/reports/writeoffs?start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.000Z",
  "/api/dashboard/summary"
)

$results = @()

foreach ($endpoint in $endpoints) {
  Write-Host ""
  Write-Host "Measuring $endpoint"
  $durations = @()
  $statusCodes = @()

  for ($i = 1; $i -le $RequestsPerEndpoint; $i++) {
    $uri = "$BaseUrl$endpoint"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $statusCode = 0
    try {
      $response = Invoke-WebRequest -Uri $uri -Headers $headers -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
      $statusCode = [int]$response.StatusCode
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      } else {
        $statusCode = -1
      }
    } finally {
      $sw.Stop()
    }
    $durations += [double]$sw.Elapsed.TotalMilliseconds
    $statusCodes += $statusCode
  }

  $p50 = Get-Percentile -Values $durations -Percentile 50
  $p95 = Get-Percentile -Values $durations -Percentile 95
  $p99 = Get-Percentile -Values $durations -Percentile 99
  $avg = ($durations | Measure-Object -Average).Average
  $min = ($durations | Measure-Object -Minimum).Minimum
  $max = ($durations | Measure-Object -Maximum).Maximum
  $ok = ($statusCodes | Where-Object { $_ -ge 200 -and $_ -lt 300 }).Count
  $errors = $statusCodes.Count - $ok

  $row = [PSCustomObject]@{
    Endpoint = $endpoint
    Requests = $RequestsPerEndpoint
    OK = $ok
    Errors = $errors
    P50_ms = [Math]::Round($p50, 2)
    P95_ms = [Math]::Round($p95, 2)
    P99_ms = [Math]::Round($p99, 2)
    Avg_ms = [Math]::Round($avg, 2)
    Min_ms = [Math]::Round($min, 2)
    Max_ms = [Math]::Round($max, 2)
  }
  $results += $row
}

Write-Host ""
Write-Host "========== P95 Summary =========="
$results | Sort-Object P95_ms -Descending | Format-Table -AutoSize
