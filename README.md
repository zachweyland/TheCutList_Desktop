# The Cut List Desktop

Minimal Electron wrapper for [The Cut List](https://cutlist.sixteen33.com).

## What it does

- Opens the live site in a desktop app window
- Remembers window size and position
- Shows a simple offline message if the site cannot be reached
- Supports app updates through GitHub Releases

## Project layout

- [`cutlist-desktop/package.json`](cutlist-desktop/package.json)
- [`cutlist-desktop/main.js`](cutlist-desktop/main.js)
- [`cutlist-desktop/electron-builder.yml`](cutlist-desktop/electron-builder.yml)

## Local development

```bash
cd cutlist-desktop
npm install
npm start
```

Auto-updates do not run in plain development mode. They run in packaged builds.

## Build locally

```bash
cd cutlist-desktop
npm install
npm run build-mac
```

Windows installer:

```bash
cd cutlist-desktop
npm install
npm run build-win
```

## Auto-update setup

The app is configured to use GitHub Releases from:

`zachweyland/TheCutList_Desktop`

When a packaged app launches, it checks GitHub for a newer version. If an update is downloaded, the user is prompted to restart and install it.

Important constraints:

- macOS auto-update requires the app to be code signed
- For distribution outside your own Mac, notarization is still recommended
- Each release must use a higher version than the previous one

## Publish an update

1. Bump the version in `cutlist-desktop/package.json`
2. Commit and push the version change
3. Export the required signing and publishing credentials
4. Run the publish script

Example macOS release:

```bash
export CSC_NAME="Developer ID Application: Zachary Weyland (D9CPM24CLR)"
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="D9CPM24CLR"
export GITHUB_RELEASE_TOKEN="your-github-token"

cd cutlist-desktop
npm install
npm run publish-mac
```

Example Windows release:

```bash
export GITHUB_RELEASE_TOKEN="your-github-token"

cd cutlist-desktop
npm install
npm run publish-win
```

`electron-builder` will publish the installer and update metadata to GitHub Releases. The installed app will then detect the newer version automatically.

## Notes

- The current app wraps the live production site. There is no bundled frontend and no local server.
- The GitHub token used to publish releases should have permission to write repository contents.
