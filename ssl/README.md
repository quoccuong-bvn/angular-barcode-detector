# SSL Certificates for HTTPS Development

This directory contains SSL certificates for running the Angular application with HTTPS.

## Why HTTPS?

Camera access in modern browsers requires HTTPS for security reasons, especially on mobile devices.

## Quick Setup

### Option 1: Using mkcert (Recommended - Easy & Trusted)

1. Install mkcert:
   ```bash
   # Windows (using Chocolatey)
   choco install mkcert

   # Or download from: https://github.com/FiloSottile/mkcert/releases
   ```

2. Install local CA:
   ```bash
   mkcert -install
   ```

3. Generate certificates:
   ```bash
   cd ssl
   mkcert -key-file localhost.key -cert-file localhost.crt localhost 127.0.0.1 ::1
   ```

### Option 2: Using OpenSSL

1. Install OpenSSL:
   ```bash
   # Windows (using Chocolatey)
   choco install openssl
   ```

2. Run the generation script:
   ```bash
   # Git Bash / WSL
   bash generate-cert.sh

   # Or use the PowerShell script first, then convert
   ```

### Option 3: PowerShell (Windows)

1. Run as Administrator:
   ```powershell
   .\generate-cert.ps1
   ```

2. Then convert using OpenSSL (see output instructions)

## Mobile Device Setup

To test on mobile devices over your local network:

1. Find your computer's IP address:
   ```bash
   ipconfig  # Windows
   ```

2. Generate certificate with your IP:
   ```bash
   mkcert -key-file localhost.key -cert-file localhost.crt localhost 192.168.x.x
   ```

3. Trust the certificate on your mobile device:
   - Find the mkcert root CA: `mkcert -CAROOT`
   - Share the `rootCA.pem` file to your mobile device
   - Install it as a trusted certificate

## Verify Setup

After generating certificates, you should have:
- `localhost.key` - Private key
- `localhost.crt` - Certificate file

Then run: `npm run start:https`
