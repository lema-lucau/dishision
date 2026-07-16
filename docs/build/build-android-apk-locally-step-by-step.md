# Our Migration — Local Android Build Guide

## Overview
This guide documents the full process to build the Our Migration React Native (Expo) app locally on Windows using WSL2. First build takes ~42 minutes, subsequent builds are faster due to Gradle caching.

---

## Prerequisites & Recommended Specs

| Component | Minimum | Recommended |
|---|---|---|
| RAM | 8GB | 16GB+ |
| Disk | 50GB free | 100GB+ free |
| OS | Windows 10 | Windows 11 |
| CPU | Must support Intel VT-x or AMD-V | Any modern CPU |

> With 8GB RAM, the build is possible but requires swap configuration (see below). 16GB+ removes that constraint entirely.

---

## Step 1 — Enable Virtualisation

### Enable in Windows
Open PowerShell as Administrator and run:
```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

### Enable in BIOS (HP laptops)
1. Restart and spam **F10** to enter BIOS
2. Go to **Advanced** → **System Options** or **Device Configurations**
3. Enable **Virtualization Technology (VTx)**
4. Press **F10** to save and exit

---

## Step 2 — Install WSL2 + Ubuntu

In PowerShell:
```powershell
wsl --install -d Ubuntu
```

Restart when prompted. Ubuntu will finish setup on next boot and ask you to create a username and password.

Open Ubuntu going forward by searching "Ubuntu" in the Start menu.

---

## Step 3 — Configure WSL2 Memory & Swap

Create `C:\Users\YOUR_USERNAME\.wslconfig` in Notepad with:
```
[wsl2]
memory=6GB
swap=16GB
processors=2
```

This is critical on 8GB machines — without swap the build will OOM kill mid-compile. Shut down WSL after saving:
```powershell
wsl --shutdown
```

Then reopen Ubuntu.

---

## Step 4 — Install Java 17 in WSL

```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk
```

Verify:
```bash
java -version
# Should show openjdk 17.x.x
```

---

## Step 5 — Install Android Command Line Tools in WSL

```bash
mkdir -p ~/android/cmdline-tools
cd ~/android/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
```

Install SDK components:
```bash
sdkmanager --licenses   # Accept all with 'y'
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

---

## Step 6 — Install Node.js in WSL

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Then install EAS CLI:
```bash
npm install -g eas-cli
```

---

## Step 7 — Set Environment Variables (Permanent)

Add all of these to `~/.bashrc`:
```bash
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export ANDROID_HOME=$HOME/android' >> ~/.bashrc
echo 'export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.bashrc
echo 'export TMPDIR=/home/YOUR_USERNAME/tmp' >> ~/.bashrc
echo 'export GRADLE_OPTS="-Xmx6g -XX:MaxMetaspaceSize=2g"' >> ~/.bashrc
source ~/.bashrc
```

Create the tmp directory:
```bash
mkdir -p ~/tmp
```

> **TMPDIR is critical.** Without it, Gradle writes to the RAM-backed `/tmp` filesystem and runs out of space during native compilation.
>
> **GRADLE_OPTS is critical.** Without sufficient heap and metaspace, the JVM crashes during the lint phase at the very end of an otherwise successful build.

---

## Step 8 — Configure WSL Permissions

Add this to `/etc/wsl.conf` (required for Git and filesystem operations on Windows-mounted drives):
```bash
sudo nano /etc/wsl.conf
```

```
[boot]
systemd=true

[user]
default=YOUR_USERNAME

[automount]
options = "metadata"
```

---

## Step 9 — Fix the minSdkVersion

`react-native-health-connect` requires minSdk 26. In `app.json`:
```json
{
  "expo": {
    "android": {
      "minSdkVersion": 26
    }
  }
}
```

Or via `expo-build-properties` plugin (preferred):
```json
[
  "expo-build-properties",
  {
    "android": {
      "minSdkVersion": 26
    }
  }
]
```

---

## Step 10 — Run the Build

Navigate to your project:
```bash
cd /mnt/c/Users/YOUR_USERNAME/Documents/Projects/our-migration/travel-companion
```

Run:
```bash
eas build --platform android --profile preview --local
```

First build: ~42 minutes. Subsequent builds: faster due to Gradle cache.

The APK will be output to your project root as `build-XXXXXXXXXX.apk`.

---

## Step 11 — Install to Phone

Copy the APK to your phone via USB, open it from your file manager and tap to install.

Make sure **Install unknown sources** is enabled on your phone:
Settings → Apps → Special app access → Install unknown apps → enable for your file manager.

---

## Troubleshooting

### `minSdkVersion` conflict
```
Manifest merger failed: uses-sdk:minSdkVersion 24 cannot be smaller than version 26
```
**Fix:** Set `minSdkVersion: 26` in `app.json` as shown in Step 9.

---

### `JAVA_HOME is not set`
```
JAVA_HOME is not set and no 'java' command could be found
```
**Fix:** Run the `~/.bashrc` exports from Step 7 and `source ~/.bashrc`.

---

### `SDK location not found`
```
SDK location not found. Define a valid SDK location with ANDROID_HOME
```
**Fix:** Ensure `ANDROID_HOME` is set and the Android SDK is installed at that path (Step 5 & 7).

---

### `No space left on device`
```
java.io.IOException: No space left on device
```
**Fix:** TMPDIR is pointing to the RAM-backed `/tmp`. Ensure `export TMPDIR=/home/YOUR_USERNAME/tmp` is set and the directory exists.

---

### `OutOfMemoryError: Metaspace`
```
Execution failed: A failure occurred while executing AndroidLintWorkAction > Metaspace
```
**Fix:** Ensure `GRADLE_OPTS="-Xmx6g -XX:MaxMetaspaceSize=2g"` is set. This hits right at the end of the build during lint — very frustrating to debug.

---

### Corrupted Gradle cache (`metadata.bin not found`)
```
Could not read workspace metadata from ~/.gradle/caches/.../metadata.bin
```
**Fix:** Wipe the entire Gradle directory and retry:
```bash
rm -rf ~/.gradle/
eas build --platform android --profile preview --local
```

---

### WSL crashes / `Wsl/Service/E_UNEXPECTED`
The build is killing WSL due to RAM exhaustion. Ensure:
- `.wslconfig` has `swap=16GB` set
- `GRADLE_OPTS` is configured with sufficient heap
- Nothing else is running on Windows during the build

---

## Notes

- **Cloud builds** (`eas build` without `--local`) work fine now that minSdk is fixed, but use your monthly quota. Use local builds for iteration.
- **Gradle cache** persists between builds at `~/.gradle/`. Subsequent builds skip recompilation of unchanged modules and are significantly faster.
- **Cleaning up:** `~/tmp/` is used during the build and can be cleared between builds if disk space is a concern: `rm -rf ~/tmp/lucau/`