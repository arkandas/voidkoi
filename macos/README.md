<img src="Resources/koi.png" alt="voidkoi" width="96" height="96">

# voidkoi for Mac

voidkoi for Mac wraps a single voidkoi server in a native macOS window

## macOS integration

- Downloads go to `~/Downloads`, with upload and download progress on the Dock icon
- Dropping files or folders onto the Dock icon, or onto a page that does not handle them, uploads them to the folder open in Files
- Print and Save as PDF use the native macOS print dialog
- Microphone and camera access for Talk calls
- Autoplay and full-screen playback for videos
- macOS notifications and Dock badge updates from server pages
- External websites open in the default browser
- OpenID Connect sign-in stays inside the app window
- `mailto:` and `tel:` links open in their apps, with a confirmation step for links to any other app
- Light and dark window colors that follow the page
- The window keeps its size, position and last visited page between launches
- Calls and uploads continue after the window closes
- The Dock icon brings the window back

## Menus

| Menu | Items |
|---|---|
| voidkoi | Preferences (⌘,) for the server, Sign Out |
| File | Close Window (⌘W), Print (⌘P) |
| Edit | Standard macOS editing commands. Find (⌘F) focuses the page's search box |
| View | Actual Size (⌘0), Zoom In (⌘+), Zoom Out (⌘-), Enter Full Screen |
| Go | Back (⌘[), Forward (⌘]), Reload (⌘R), app navigation (⌘1 through ⌘7), Settings, Admin |
| Window, Help | Standard macOS menus |

Sign Out clears the cookies, local storage and caches this Mac keeps for the server and its OpenID Connect provider. It then returns to the sign-in page.

The account menu in the web app also signs out of the identity provider.

## Server configuration

The application has no hardcoded server address. It uses the first address available from:

1. Preferences (⌘,)
2. The address bundled at build time through `VOIDKOI_SERVER` or `build.conf`
3. A prompt at launch, when neither exists

The address must be a site origin without a path, for example:

- `https://example.com`
- `http://192.168.1.20:3000`

Plain HTTP works only for localhost, private network addresses and `.local` hostnames.

Each server has its own cookies and local storage. Switching servers clears the previous server's session and stored data.

## Building

Building requires macOS 14 or later, Xcode and `rsvg-convert`.

```bash
./build.sh                                      # build/voidkoi.app
VOIDKOI_SERVER=https://example.com ./build.sh   # bundle a server address
./build.sh --dmg                                # also build/voidkoi.dmg
./build.sh --debug                              # debug build
```

A `build.conf` file next to `build.sh` can also hold the bundled server address:

```bash
VOIDKOI_SERVER=https://example.com
```

Git ignores `build.conf`. The build writes the address to `Info.plist` under `VoidkoiServer`. `build.sh` validates the address with the same rules as the app. URLs that contain a username or password fail the validation.

### Debug builds

The `--debug` flag enables the Web Inspector and snapshot mode. Debug builds use the bundle identifier `com.arkandas.voidkoi.debug`, which keeps their settings and application data separate from the regular app.

### Icons

`make-icons.sh` generates the assets in `Resources/` from the brand files:

- `AppIcon.icns` uses the koi mark from `../brand/logo/` on a void tile
- The Go menu icons come from `../brand/apps/`

`build.sh` runs `make-icons.sh` automatically when `AppIcon.icns` is missing.

### Distribution

The app is not notarized. macOS may block the first launch of a copy built on another Mac. To open it, allow the app in System Settings > Privacy & Security.

## The JavaScript bridge

Pages from the configured server communicate with the native app through:

```js
window.webkit.messageHandlers.voidkoi
```

The bridge exists only inside the Mac app. The app's user agent ends with `voidkoi/<version>`.

Calls to `postMessage` return promises. The app rejects messages from external websites, embedded frames and unknown message types.

### Notifications

Server pages can send native macOS notifications:

```js
await window.webkit.messageHandlers.voidkoi.postMessage({
  type: 'notify',
  title: 'Ana',           // required
  body: 'Are you there?', // optional
  url: '/talk',           // optional: a page of the server, opened by a click on the notification
  tag: 'talk-42',         // optional: replaces the earlier notification with this tag
  silent: false,          // optional: true for no sound
});
```

The promise resolves to `true` once the notification appears and to `false` when notifications are off for voidkoi. The first notification triggers the permission prompt. Notifications also appear while the app is in front. The page decides when to send one.

### Badge

```js
await window.webkit.messageHandlers.voidkoi.postMessage({ type: 'badge', count: 3 });
```

`count: 0` clears the badge. A message without `count` shows a dot. `navigator.setAppBadge()` and `navigator.clearAppBadge()` work the same way.

### Page changes inside the app

- `navigator.clipboard.writeText` writes to the macOS clipboard, also after an `await`
- `window.print()` opens the print panel
- `URL.revokeObjectURL` waits 30 seconds to let blob downloads finish
- The window color comes from `--canvas` on the root element, with the body's background as the fallback

## Snapshot mode

Debug builds have a snapshot mode for checking the UI. With `VOIDKOI_SNAPSHOT` set to a folder, the app renders its windows off screen into that folder before it quits:

```bash
VOIDKOI_SNAPSHOT=/tmp/shots VOIDKOI_SNAPSHOT_SERVER=http://localhost:3000 \
VOIDKOI_SNAPSHOT_STEPS="/login /files" build/voidkoi.app/Contents/MacOS/voidkoi
```

A run saves `preferences.png`, `server-prompt.png`, one picture per step, `menus.txt` and `log.txt`. The top of `Sources/voidkoi/Snapshots.swift` lists the steps and the other variables. Snapshot runs stay out of the Dock with no state between runs. Links meant for other apps go to `log.txt` only.

## License

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.
