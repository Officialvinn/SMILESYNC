# Deploying SmileSync

This guide puts the server (API, database, dashboard) on your own Linux server
under your domain, then builds the CHW app pointed at it. Plan about an hour
the first time.

Throughout, replace `smilesync.example.org` with your domain.

## What you need

- A Linux server (Ubuntu 22.04 or 24.04 is assumed) with a public IP address,
  at least 2 GB RAM and 20 GB disk, and SSH access with `sudo`.
- A domain where you can edit DNS records.
- Your Mac, with this repo, for building the phone app.

Kenya Data Protection Act 2019: the server holds health data. Before real
patients, confirm where the server is located is acceptable to your
institution, and that SmileSync's operator is registered with the Office of
the Data Protection Commissioner as a data controller or processor.

## 0. On AWS (EC2): do these first

Skip this section on any other host.

1. **Disk encryption.** EC2 > Volumes: the instance's volume must show
   *Encrypted*. If it says *Not encrypted* and the server holds nothing yet, the
   simplest fix is a new instance: first turn on EC2 > Settings > *EBS encryption*
   ("Always encrypt new EBS volumes") for the region, then launch again.
2. **A fixed address.** EC2 > Elastic IPs > Allocate, then *Associate* it with the
   instance. Without it the public IP changes when the instance stops, and the
   domain stops working. (AWS bills every public IPv4 address, about US$3.60 a
   month, whether or not it is an Elastic IP.)
3. **Security group** (the instance's firewall). Inbound rules:
   SSH 22 from *My IP* only; HTTP 80 and HTTPS 443 from anywhere (0.0.0.0/0 and ::/0).
   Nothing else; PostgreSQL 5432 must **not** be open. `ufw` in step 2 is then optional.
4. **Memory.** A 1 GB instance (t2/t3/t4g.micro) runs SmileSync but runs out of
   memory while building it. Add swap once, after logging in:

   ```sh
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
5. **Log in** with the key pair you chose at launch:
   `ssh -i ~/path/to/key.pem ubuntu@<elastic-ip>` (`ec2-user@` on Amazon Linux).
6. **Amazon Linux only** (the Docker script in step 2 needs Ubuntu or Debian):

   ```sh
   sudo dnf install -y docker git && sudo systemctl enable --now docker
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   sudo usermod -aG docker ec2-user && exit
   ```
   Then skip the Docker and `ufw` lines in step 2.
7. **Region and the Data Protection Act.** AWS has no region in Kenya, so the data
   leaves the country (Cape Town `af-south-1` is the closest). The Act allows that
   only with safeguards, and health data is sensitive personal data. Get your
   institution's or the ODPC's position before real patients.

## 1. Point the domain at the server

In your DNS provider, add an **A record**: name `smilesync` (or `@` for the
bare domain), value = the server's public IP (on AWS, the Elastic IP). For a
`.tech` domain this is at the registrar you bought it from (for example
get.tech, Namecheap or GoDaddy), usually under *DNS*, *Manage DNS* or
*Advanced DNS*. Remove any parked-page A record for the same name. Check from your Mac:

```sh
dig +short smilesync.example.org     # must print the server's IP
```

Wait until it does before step 4; Caddy needs it to get a certificate.

## 2. Prepare the server

```sh
ssh you@smilesync.example.org

# Docker and the compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit     # log out and back in for the group

# Firewall: SSH and web only. PostgreSQL stays bound to the server itself.
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

Port 80 must stay open: Let's Encrypt checks it, and Caddy redirects it to https.

**Disk encryption (NFR 1).** Patient names and photos are encrypted by the API,
but ages, counties, symptoms and dentist notes sit in PostgreSQL as plain rows.
The server's disk must be encrypted: confirm your host encrypts volumes at rest
(most cloud providers do, check their docs), or on your own hardware install
Ubuntu with full-disk encryption (LUKS).

## 3. Get the code and write `.env`

```sh
git clone https://github.com/Officialvinn/SMILESYNC.git smilesync && cd smilesync
cp .env.example .env && chmod 600 .env
```

Generate **new** secrets on the server. Never reuse the ones from your laptop:

```sh
for n in 1 2; do openssl rand -hex 24; done   # POSTGRES_PASSWORD, APP_DB_PASSWORD
openssl rand -hex 32                          # JWT_SECRET
openssl rand -base64 32                       # PATIENT_DATA_KEY
```

Edit `.env` (`nano .env`) and set:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | the two hex values |
| `JWT_SECRET` | the 32-byte hex value |
| `PATIENT_DATA_KEY` | the base64 value |
| `SITE_ADDRESS` | `smilesync.example.org` |
| `SEED_PASSWORD`, `SEED_CHW_PIN` | **leave empty**: no demo accounts in production |

**Copy `PATIENT_DATA_KEY` to a password manager or a sealed paper copy now.**
It encrypts patient names and photos. If it is lost, they cannot be recovered,
and backups do not contain it.

## 4. Start it

```sh
docker compose up -d --build
docker compose ps                         # db, api, caddy: running; migrate: exited (0)
curl https://smilesync.example.org/api/health
```

The first start takes a few minutes (it builds the images). If `curl` reports a
certificate error, check `docker compose logs caddy`: almost always DNS not yet
pointing at the server, or port 80 blocked.

## 5. Create the first administrator

The demo seed refuses to run in production, so the server starts with no
accounts. Create one administrator (the password is asked for, hidden):

```sh
docker compose run --rm -it migrate npx tsx prisma/createAdmin.ts ops.admin
```

Then open `https://smilesync.example.org`, log in as that admin, and under
**Users** create the dentists (password) and each CHW (6-digit PIN, CHW code,
site). Give each person their login in person, not by SMS or email.

## 6. Backups

Run daily from cron, and copy the backups off the server (to encrypted storage):

```sh
crontab -e
# add:
30 2 * * * cd $HOME/smilesync && scripts/backup.sh >> backups/backup.log 2>&1
```

Test a restore once before going live: `scripts/verify-backup.sh backups/<stamp>`,
and see `scripts/restore.sh`. The audit log must be kept 12 months (NFR 4), so
keep at least one backup per month for a year.

## 7. Updating the server

```sh
cd ~/smilesync && git pull && docker compose up -d --build
```

Database migrations run automatically (the `migrate` service) before the API starts.

## 8. Build the CHW app (on your Mac)

### Once: create the upload key

```sh
keytool -genkeypair -v -keystore ~/smilesync-upload.jks -alias smilesync \
  -keyalg RSA -keysize 2048 -validity 10000
```

Back up `~/smilesync-upload.jks` and its password together with
`PATIENT_DATA_KEY`. Every future update must be signed with this same key, or
phones refuse to install it. Never commit it.

### Each release

1. In `apps/mobile/app.json`, raise `android.versionCode` by 1 (and set
   `version`, e.g. `1.0.1`). The first release can stay at `versionCode` 1.
2. Build:

   ```sh
   cd apps/mobile
   EXPO_PUBLIC_API_URL=https://smilesync.example.org/api npm run build:android
   ```

   The APK is at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
   (about 60 MB). For Google Play, run `./build-release.sh aab` instead.

It uses `~/smilesync-upload.jks` and asks for its password (hidden), checking
   it before the build starts. The script refuses to build without the key or with a localhost address, and
never includes the local development certificate. Afterwards, the `android/`
folder is the release project: run the development `prebuild` from
`apps/mobile/README.md` again before going back to development.

### Getting it onto CHW phones

- **Direct install (pilot, free):** copy the APK to each phone (USB, or a shared
  Drive link), open it, allow "Install unknown apps" for that one source when
  asked. Updates: install the new APK over the old one; cases on the phone are kept.
  If a phone has the development build, uninstall that first (different key).
- **Google Play closed testing ($25 one-time developer account):** upload the
  `.aab`, add the CHWs' Google accounts as testers; they install and update from
  the Play Store.

Each CHW must log in once **with internet** on their phone; after that the app
works offline (FR 1.1).

## 9. Before real patients

Work through [FIELD_TEST.md](FIELD_TEST.md) on the release app against the real
server, and read the open items in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
