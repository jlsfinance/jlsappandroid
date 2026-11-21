# Changelog

## Unreleased

### Fixed
- Route PDF exports through the Capacitor-aware download service so receipts, reports, ledgers, due lists, and legal notices can be saved or opened on Android instead of relying on browser-only `jsPDF.save()` behavior.
- Preserve web-browser downloads through the existing download service.
- Synchronize the npm lockfile with the declared Capacitor Push Notifications 7.x dependency so clean CI installs succeed.
