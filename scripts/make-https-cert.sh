#!/usr/bin/env bash
# Makes a certificate for `npm run preview:https` on your home network.
# Usage: scripts/make-https-cert.sh <this computer's IP, e.g. 192.168.1.156>
#
# Creates a one-off certificate authority restricted to that /24 network (it cannot vouch for
# real websites), signs one server certificate with it, then deletes the authority's key so it
# can sign nothing else. Install guitar2lute-ca.crt on the phone as a CA certificate.
set -euo pipefail
ip="${1:?Usage: $0 <IP address of this computer>}"
[[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.[0-9]{1,3}$ ]] || { echo "Not an IPv4 address: $ip" >&2; exit 1; }
net="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}.0"
dir="$HOME/.config/guitar2lute/https"
mkdir -p "$dir" && chmod 700 "$dir" && cd "$dir"
rm -f ca.key server.key server.crt guitar2lute-ca.crt

cat > ca.cnf <<CNF
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ca
[dn]
CN = Guitar2Lute local CA
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;IP:$net/255.255.255.0, permitted;DNS:guitar2lute.invalid
CNF
cat > server.cnf <<CNF
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = IP:$ip
authorityKeyIdentifier = keyid
subjectKeyIdentifier = hash
CNF

openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -x509 -new -key ca.key -sha256 -days 397 -config ca.cnf -out guitar2lute-ca.crt
openssl ecparam -name prime256v1 -genkey -noout -out server.key
openssl req -new -key server.key -subj "/CN=Guitar2Lute preview" -out server.csr
openssl x509 -req -in server.csr -CA guitar2lute-ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 397 \
  -extfile server.cnf -out server.crt 2>/dev/null
shred -u ca.key 2>/dev/null || rm -f ca.key
rm -f server.csr guitar2lute-ca.srl
chmod 600 server.key
openssl verify -CAfile guitar2lute-ca.crt server.crt
echo "Install on the phone: $dir/guitar2lute-ca.crt"
