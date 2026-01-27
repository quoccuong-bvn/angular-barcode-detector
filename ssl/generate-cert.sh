# Generate SSL certificates for HTTPS development

# For Windows (using OpenSSL via Git Bash or installed OpenSSL)
# If you don't have OpenSSL, you can use Chocolatey: choco install openssl

# 1. Generate private key
openssl genrsa -out localhost.key 2048

# 2. Generate certificate signing request
openssl req -new -key localhost.key -out localhost.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# 3. Generate self-signed certificate (valid for 365 days)
openssl x509 -req -days 365 -in localhost.csr -signkey localhost.key -out localhost.crt

# Note: You'll need to trust this certificate in your browser/device
# For Chrome: chrome://flags/#allow-insecure-localhost
# For mobile devices: Install the certificate on your device
