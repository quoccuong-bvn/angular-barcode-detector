# End User Guide

**1) Install and Run the HTTPS Server on PC**
1. Open a terminal in the project folder.
2. Install dependencies (first time only):

```bash
npm install
```

3. Start the HTTPS dev server:

```bash
npm run start:https
```

4. Open on the PC:
   `https://localhost:4200`

If you see a browser warning, choose “Advanced” then “Proceed”.

**2) Create a New Certificate for the Current Host**

You must create and trust a certificate on the same machine that runs the HTTPS server.

Recommended: mkcert (easiest)
1. Install mkcert and trust its local CA:
   `choco install mkcert`
   `mkcert -install`
2. Generate a cert that includes localhost and your LAN IP:
   `cd ssl`
   `mkcert -key-file localhost.key -cert-file localhost.crt localhost 127.0.0.1 ::1 <LAN-IP>`

Alternative: use the existing scripts in `ssl/` with OpenSSL.

Note: If the IP or machine changes, regenerate a new certificate and re‑trust it on devices.

**3) Run on Mobile (iOS and Android)**

Prepare:
1. Make sure the phone and PC are on the same Wi‑Fi network.
2. Find your PC’s LAN IP:
   `ipconfig` and use the IPv4 address (example: `192.168.1.10`).
3. Open the app in the phone browser:
   `https://<LAN-IP>:4200`

**iOS Certificate Install (required for camera)**
1. Copy `ssl/localhost.crt` to the iPhone/iPad (AirDrop, Mail, Files).
2. Open the `.crt` file and install the profile.
3. Enable full trust:
   `Settings > General > About > Certificate Trust Settings` and enable the new cert.
4. Open Safari and go to `https://<LAN-IP>:4200`.

If Safari shows a hostname/IP mismatch, regenerate the cert to include the current LAN IP.

**Android**
Open `https://<LAN-IP>:4200` in Chrome/Edge and allow camera access.
