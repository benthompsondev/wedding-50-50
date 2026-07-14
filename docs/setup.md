# Setup

## Local development

Requirements:

- Node.js 22 or newer
- npm

```powershell
npm ci
npm test
npm run lint
npm run build
npm run dev
```

The project is configured for the GitHub Pages base path `/wedding-50-50/`.

## Production configuration

The live values are stored in `src/config.ts` and the matching Apps Script configuration. Dates, pricing, payment details, and the deployed endpoint must stay aligned.

Do not put a private Sheet URL, Google credential, API key, or participant record in the frontend or repository.

## Private Google Sheet recovery setup

The production Sheet and Apps Script deployment already exist. These steps are for recovery or a future replacement, not routine development.

1. Create a private Google Sheet owned by a trusted event administrator.
2. Open **Extensions > Apps Script**.
3. Replace the default script with `apps-script/Code.gs`.
4. Replace the manifest with `apps-script/appsscript.json`.
5. Review the private `SITE_CONFIG` values.
6. Save the Apps Script project and reload the Sheet.
7. Choose **Wedding Draw > Setup Spreadsheet**.
8. Approve permissions from the trusted owner account.
9. Confirm `Orders`, `Summary`, `Jar Entries`, and `Printable Jar Slips` were created.
10. Deploy the Apps Script project as a web app running as the owner and available to anyone with the link.
11. Add the resulting `/exec` URL to `appsScriptEndpoint` in `src/config.ts`.
12. Run one clearly marked test using fake participant details.
13. Verify the email, private row, payment checkbox, jar rows, printable slips, and aggregate public counter.
14. Remove all fake records, slips, totals, and test emails before accepting real submissions.

## GitHub Pages

Pushes to `main` run `.github/workflows/deploy.yml`. The workflow installs dependencies, runs tests, builds the Vite site, uploads `dist`, and deploys it through the supported GitHub Pages actions.

`dist` is generated in CI and must not be committed.
