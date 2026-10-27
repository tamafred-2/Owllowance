# Owllowance

A calm, offline budget and expense tracker for Android. Your records stay on your phone: no account, no ads, no internet needed.

## Download

Get the latest APK from **[Releases](https://github.com/tamafred-2/Owllowance/releases)**. Open the file on your Android phone and allow installing from your browser or file manager when asked. It runs on most phones from the last several years (64-bit ARM).

Each release lists a SHA-256 checksum so you can confirm the file is genuine.

## Features

- Expenses and income across Cash, e-wallets and bank wallets
- Transfers between wallets, with optional fees
- Budgets, recurring bills with reminders, and savings goals with photos
- Debts: what you owe and what is owed to you
- Insights by category; history with search, filters and CSV export
- Home-screen widgets for payments due, quick add and net worth
- App lock (fingerprint, face or PIN) and password-protected backups
- Light and dark themes

## Your data

Everything is stored only on your device. Export a backup regularly from **Settings → Export backup**; add a password to encrypt it. If you uninstall the app or lose your phone without a backup, your records cannot be recovered.

## Build from source

Requires Node.js 24 LTS and npm.

```powershell
npm ci
npm start          # Expo development server
npm run web        # browser version
npm test           # unit tests
```

## License and disclaimer

© 2026 Al Fred. All rights reserved; see [LICENSE](LICENSE). Open-source components keep their own licenses, listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and in the app under **Settings → Open-source licenses**.

Owllowance is provided as is, without warranty. It is a personal record-keeping tool, not financial advice, and it is not affiliated with or endorsed by any bank or e-wallet provider whose name you may enter.
