# APEXFlow HTTPS Setup

This guide covers local HTTPS on Windows, macOS, and Linux, plus LAN access
from a Mac. HTTPS is required for secure browser features such as microphone
recording when APEXFlow is opened through a LAN IP address.

Choose the setup that matches how you use APEXFlow:

- **APEXFlow and the browser run on the same computer:** follow **Local HTTPS
  setup**. No certificate transfer is required.
- **A Mac connects to APEXFlow on another computer over LAN:** follow
  **Remote Mac setup** after enabling HTTPS on the host.

Generating a certificate does not change an already running APEXFlow session.
Restart APEXFlow and choose HTTPS when prompted.

## Local HTTPS setup

Use these steps when APEXFlow and the browser run on the same computer.

1. Complete the normal installation with `setup.bat` on Windows or
   `./setup.sh` on macOS/Linux.
2. From the APEXFlow project directory, run the HTTPS setup for your operating
   system:

   ```text
   Windows:       enable-https.bat
   macOS/Linux:  ./enable-https.sh
   ```

   The script installs a local CA into the host's trust store and generates the
   server certificate. Approve any operating-system password or trust prompt.
3. Start APEXFlow:

   ```text
   Windows:       start.bat
   macOS/Linux:  ./start.sh
   ```

4. Choose HTTPS when prompted, then open:

   ```text
   https://localhost:3000
   ```

No certificate transfer is needed for local access. If a different Mac will
connect to this computer over the LAN, that Mac must complete the remote setup
below.

## Remote Mac setup

Use these steps when the Mac browser connects over the LAN to APEXFlow running
on a Windows PC, Linux computer, or a different Mac.

### 1. Enable HTTPS on the host computer

From the APEXFlow project folder on the host computer, run the command for its
operating system:

```text
Windows:       enable-https.bat
macOS/Linux:  ./enable-https.sh
```

The script generates a certificate for the current machine, including its
current LAN IP address. It also creates the public root CA certificate that the
Mac needs to trust:

```text
certs\local\apexflow-rootCA.pem
```

Start APEXFlow with `start.bat` on Windows or `./start.sh` on macOS/Linux,
choose HTTPS, and note the LAN URL printed in the terminal. It will look
similar to:

```text
https://192.168.1.100:3000
```

Use the address shown on your own computer. The example address above may not
match your network.

### 2. Copy the public root certificate to the client Mac

Copy this file from the host computer's project folder to the client Mac using
a trusted method such as a private file share or USB drive:

```text
certs\local\apexflow-rootCA.pem
```

The root CA certificate is public and is the only certificate file that should
be transferred. **Never copy, publish, or share either of these private keys:**

```text
certs\local\apexflow-key.pem
rootCA-key.pem
```

If the host setup printed a SHA-256 fingerprint, verify the transferred file on
the Mac before installing it:

```bash
shasum -a 256 ~/Downloads/apexflow-rootCA.pem
```

The result must match the fingerprint shown on the trusted host. Do not install
the certificate if the fingerprints differ.

### 3. Trust the certificate on macOS

#### Terminal method

If the certificate is in the Mac's Downloads folder, run:

```bash
sudo security add-trusted-cert \
  -d \
  -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ~/Downloads/apexflow-rootCA.pem
```

Enter the Mac administrator password when prompted. The `-k` option and its
keychain path must be separated by a space.

#### Keychain Access method

1. Open **Keychain Access** on the Mac. The application name is localized on
   non-English versions of macOS.
2. Select the **System** keychain, not **System Roots**.
3. Choose **File > Import Items** and select `apexflow-rootCA.pem`.
4. Find the imported `mkcert` root certificate. Its exact name depends on the
   Windows account that generated it.
5. Double-click it and expand **Trust**.
6. Set **When using this certificate** to **Always Trust**.
7. Close the window and enter the Mac administrator password.
8. Fully quit Safari and Chrome, then reopen them.

### 4. Allow local-network access on the Mac

Open:

```text
System Settings > Privacy & Security > Local Network
```

Allow Safari and/or Google Chrome to access the local network. Fully quit and
reopen the browser after changing this permission.

### 5. Open APEXFlow

Enter the complete HTTPS URL printed by the host's start script, including
`https://` and the port number, in the Mac browser. For example:

```text
https://192.168.1.100:3000
```

Browsers do not reliably upgrade a bare LAN address from HTTP to HTTPS, so type
or bookmark the full HTTPS URL.

The browser should now show a trusted, secure connection. Resolve any
certificate warning before testing microphone recording.

### 6. Allow microphone access

When APEXFlow starts recording for the first time, allow the browser to use the
Mac's microphone.

In Safari, microphone permissions are available under:

```text
Safari > Settings > Websites > Microphone
```

In Chrome, select the site controls icon beside the address bar and set
**Microphone** to **Allow**.

The Mac browser captures the recording and uploads it to the APEXFlow host.
Music generation continues to use the host computer's GPU.

## Troubleshooting

### The HTTPS page cannot be reached

- Confirm that the host computer and Mac are on the same local network.
- Confirm that APEXFlow was started in HTTPS mode.
- Use the exact HTTPS LAN URL printed by the host's start script.
- Confirm that the browser has macOS local-network permission.
- Check whether a firewall or VPN is blocking LAN traffic to port `3000`.

### The browser still shows a certificate warning

- Confirm that the root CA was imported into the **System** keychain.
- Confirm that it is set to **Always Trust**.
- Confirm that the transferred certificate fingerprint matches the original.
- Fully quit and reopen the browser after changing certificate trust.
- Make sure the URL uses an IP address or hostname included in the generated
  server certificate.

### The certificate does not appear after using the terminal command

Check that the command contains a space between `trustRoot` and `-k`:

```text
-r trustRoot -k /Library/Keychains/System.keychain
```

If the command prints its usage information, the command syntax was invalid and
the certificate was not imported.

### The host computer's LAN IP address changed

Run `enable-https.bat` or `./enable-https.sh` again so the server certificate
includes the new IP address, then restart APEXFlow in HTTPS mode. If the same
mkcert root CA is still being used, the client Mac normally does not need to
trust the root CA again.

### Remove the certificate later

Open **Keychain Access**, select the **System** keychain, find the imported
`mkcert` root certificate, and delete it. Then restart Safari and Chrome.
