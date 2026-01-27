# Generate SSL Certificates for HTTPS (PowerShell)
# Run this script in PowerShell as Administrator

# Create self-signed certificate for localhost
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(1)

# Export certificate to file
$certPath = "$PSScriptRoot\localhost.crt"
$keyPath = "$PSScriptRoot\localhost.key"

# Export as PFX first
$pfxPath = "$PSScriptRoot\localhost.pfx"
$pwd = ConvertTo-SecureString -String "temp" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd

Write-Host "Certificate generated successfully!"
Write-Host "Certificate thumbprint: $($cert.Thumbprint)"
Write-Host ""
Write-Host "To use with Angular, you need to convert PFX to PEM format:"
Write-Host "1. Install OpenSSL (via Chocolatey: choco install openssl)"
Write-Host "2. Run these commands:"
Write-Host "   openssl pkcs12 -in localhost.pfx -nocerts -out localhost.key -nodes -passin pass:temp"
Write-Host "   openssl pkcs12 -in localhost.pfx -clcerts -nokeys -out localhost.crt -passin pass:temp"
Write-Host ""
Write-Host "Or use the simplified method:"
Write-Host "Run: npm run generate-cert"
