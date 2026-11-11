# Changelog

All notable user-visible changes to Wanheda are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [Semantic Versioning](https://semver.org/).

Releases are cut with `bun run bump patch|minor|major`: on a `release/vX.Y.Z`
branch it moves the Unreleased section under a new version heading, syncs
package.json and commits. After that PR merges, `bun run bump --tag` on main
tags it. Keep user-visible changes in the Unreleased section as you work:
it ships inside the app as What's New.

Each build phase ends in a minor version. Versions 0.1.0 to 0.5.0 were
written after the fact, one per phase, and have no git tags.

## [Unreleased]

## [0.7.4] - 2026-11-11

### Changed

- A long note no longer stretches the Notes page. The note fits the screen and scrolls inside its card, in Write and Read alike, with its tags kept in view at the bottom. The list of notes scrolls on its own too, the way Music's list does.
- A note opened from the Board now has a close button (×) at the top right of its panel, and Esc closes it too.

## [0.7.3] - 2026-11-11

### Added

- The desktop app now plays videos with Dolby Digital, Dolby Digital Plus or DTS sound. It converts the sound as the video plays, without re-encoding the picture and without writing anything to disk, and seeking works as usual. On the web, such a file now tells you the desktop app can play it.
- You can drag the floating island left or right along the top of the screen, to move it off whatever it's covering in another app. It stays where you leave it, also after a restart.
- Settings has a new Island section. Show the island turns the pill at the top of Wanheda off or on, everywhere on this device; with it off, timers and music carry on and alerts still reach your notifications. In the desktop app, Float it over other apps has moved there from Desktop.

### Changed

- Videos you add from a folder now stay in that folder. The Videos tab shows your folders as tiles; open one to see its videos, with episodes in order, and go back to all folders with one click. Before, every video was mixed into one long list.
- Adding a folder of videos no longer starts playing one of them. It just adds them.
- The Videos tab has one box where it had two. Type words and it searches your videos; paste a link and it offers to add it, and tells you what kind of link it is or that it's already in your library. Paste a file's path and it finds that file in your library. Search now also matches folder names.
- In Media, Open a file and Open a folder now sit on the same line as the link box, right after its + button.
- Wanheda now starts in the graphite Bench skin with the Gold accent: on a new account, on a new device and on the sign-in page. A look you've already picked in Settings stays as it is.
- In full screen, Up Next is now a drum. The episode in the middle faces you, and the ones above and below lean back, shrink and dim like the faces of a wheel. One notch of the mouse wheel, or an arrow key, turns it by one episode, and it opens on the episode you're playing.
- Up Next snaps. Wherever you stop scrolling, an episode settles into place, in the normal player as well as in full screen, and one notch of the mouse wheel moves exactly one episode. In full screen every episode comes to the middle; in the normal player the first and last rest at the ends of the list.
- Hover hints across the app now use Wanheda's own tooltip instead of the browser's plain grey box: the notes toolbar, the music bar, the timers, the voice controls, the colour swatches in Settings and more.
- The sidebar's Collapse button is always on show now, not only while the pointer is over the sidebar.

### Fixed

- Notices in the dark theme were almost see-through over pictures, such as "Added 74 videos" over the Videos tab. They now have a solid frosted background you can read anywhere.
- Pages no longer jump sideways when the scrollbar appears or disappears, such as when you open a folder with only a few videos.
- In demo mode, videos you added disappeared when you left Media and came back. They now stay until you reload the window or sign in.
- Double-clicking a video to enter or leave full screen no longer starts and stops it on the way. The video keeps playing, or stays paused, exactly as it was.

## [0.7.2] - 2026-11-11

### Added

- A copy button at the top right of every note copies the whole note as Markdown, its title as a heading over the text. The icon turns into a check for a moment so you know it worked.
- Your read-aloud voices follow you. Download a voice on one device and, the next time you open Wanheda somewhere it isn't yet (the Windows app, another browser), it asks whether to get it there too, with its size, so nothing downloads without your say. Choose Not now and it stays quiet until there's another voice to get. Settings → Voices shows the same offer.

## [0.7.1] - 2026-11-11

### Added

- The sign-in page shows a giant WANHEDA made of particles. Point at or tab to a sign-in button and it reshapes into PASSKEY, GITHUB or GOOGLE, then settles still.
- Click the sidebar's right edge to open or close it. The Collapse button now shows only while your pointer is over the sidebar.
- Theatre mode keeps the sidebar collapsed to give the video the full width. Trying to open it shows a short note beside your pointer explaining why, and your usual sidebar setting comes back when you leave theatre mode.
- With the sidebar open, the Wanheda name at the top is filled with a slow, living glow in your accent colour. It pours in each time you open the sidebar, follows your theme, and holds still if you prefer reduced motion.
- The sign-in page marks the way you signed in last time with a small "Last used" tag, so you know which button to press.
- You can sign in with Google as well as GitHub, on the web and in the Windows app. If your Google email is the same as your GitHub one, both buttons open the same Wanheda.
- You can delete your account yourself, in Settings → Account → Danger zone. Type your email to confirm, and your account and everything in it are gone for good, on every device, and cleared from that browser too. If you signed in more than a day ago, Wanheda asks you to sign in again first.
- Anyone can now make their own Wanheda: sign in with GitHub and you get an account with your own money, notes, library and media, kept apart from everyone else's.
- An Admin page for the people listed as admins: how many users there are, who signed up and who used Wanheda each day over the last month, how many are active today and this week, and which apps they use.
- Wanheda can run as a Windows app of its own. It opens in its own window with a tray icon, keeps playing when you close the window (Quit from the tray or the File menu stops it), and opens `wanheda://` links on the right page. On first start it asks for your `.env` file and locks the settings it knows with Windows' keychain, or starts in demo mode; File → Import .env file… and File → Use demo mode… change that later. Signing in with GitHub happens in your default browser, like other desktop apps, and Wanheda picks it up from there. The window's title bar is Wanheda's own and follows your theme; its ☰ button opens the File, Edit, View and Window menus.
- In the Windows app, Ctrl+Shift+Space opens a small Quick note window over whatever you're doing: type, press Enter, and it's in Notes. Alt+Space brings Wanheda forward with the command palette open.
- In the Windows app, the keyboard's play/pause, next and previous keys control what's playing in Wanheda, even when another app had them last. When nothing in Wanheda can play, they're left alone for your other apps.
- In the Windows app, a finished timer and new money or income alerts show as Windows notifications while Wanheda is in the background. Clicking one opens its page.
- In the Windows app, the island floats at the top of your screen while Wanheda is in the background: what's playing, read-aloud, your timers, downloads and alerts, with their buttons. Clicks pass straight through everywhere but the island. Turn it off in Settings → Desktop.
- In the Windows app, your music folder and video folders are picked once and stay connected: no "Reconnect folder" after a restart. Songs and videos you add or change in those folders show up on their own, and videos open straight from the folder without being read in full.
- In the Windows app, read-aloud uses a much faster built-in voice engine: sentences are ready long before they're needed, with the same voices you downloaded. If it ever stops working, the app switches back to the browser engine on its own.
- Settings → Desktop, in the Windows app: keep Wanheda running when you close the window, change or turn off the two shortcuts (it tells you if another app already uses the keys), and import your .env file again or go back to demo mode.

### Changed

- In dark themes, the page you're on in the sidebar now sits on the same dark background as the Wanheda logo, instead of a lighter tint.
- The web app now tells the browser exactly which sites it may load scripts, frames and data from, so a page can't be made to run code or send data anywhere else. Video embeds, cover pictures, voices and the reader work as before.

## [0.7.0] - 2026-11-08

### Added

- Read aloud has its own volume. A volume slider and a mute button sit next to the reading controls, on the island and in the read-aloud window. It's kept on this device and is separate from the music volume, so you can turn the voice down without touching your songs.
- Amy is now one of the voices you can download in Settings → Voices (about 63 MB). Her recordings don't say what they may be used for, so she's marked as not cleared for commercial use, like Lessac.
- Media opens on a new Home tab: pick up a video where you left it, replay the albums and folders you played lately, see your most played songs (with genre chips once you play more than one genre), jump into a show at the next episode you haven't watched, and find your Watch later list and what you added recently. Each row scrolls sideways; See all takes you to the full list. With nothing added yet, Home shows one card to open a folder of videos, pick your music folder or paste a link.
- Media now has three tabs in its top bar, Home, Videos and Music (where Money keeps its tabs), and opens on Home (it used to open on Videos). Videos shows your library as picture cards, with a search box. A video opens over whichever tab you were on, and Back takes you to that tab again.
- Wanheda remembers what you play, on this device only: a song counts after you've listened to 30 seconds of it, or half of it for a short one. Skipping to the end doesn't count. Music → Songs can sort by most played.
- On Home and Music, a now-playing bar floats above the dock while music plays, with the cover, play, previous and next, the wave scrub, shuffle, repeat, the volume and an Up next list you can jump around in. While the bar is showing, the island leaves the song out, so you don't see it twice.
- Videos have a new player of their own. Big skip-back, play and skip-forward buttons sit in the middle, the bar shows the time you'd jump to (and, for files on this device, the picture there), and the controls fade away while you watch and come back when you move the mouse or press a key. Full screen keeps everything: the menus, the subtitles and the "resume or start over" question all work there too.
- Shows sort themselves. Name files like `Show.S01E05.mkv`, `Show 1x05` or `Episode 5` (in the show's folder) and they play in episode order: Next, the keyboard and the media keys go to the next episode, and the player names them "Show · Season 1 · Episode 5".
- An Up next stack beside the picture lists the episodes with their pictures and how much is left, with a Season menu to look through other seasons. It opens with its button and shows itself when you pause in full screen.
- In a video's last seconds a card offers the next one and counts down to it, with Play now and Cancel. Moving on counts the one you were watching as watched. Settings in the player can turn this off.
- Picture in picture follows you to the next video however you move on: Next, the list, autoplay, the media keys or the window's own next button. If the next one can't play there (a YouTube link, a file that isn't on this device), the window closes instead of freezing.
- Videos in your list show a picture from the video itself, made on this device. YouTube links get their YouTube picture, fetched once and kept on the device.
- Subtitles are drawn by Wanheda, so they move up out of the way of the controls, and you can make them Small, Medium or Large. Press C to turn them on or off.
- The player's settings menu has speed, subtitle size, autoplay, Save this frame (downloads the picture on screen as a PNG) and a list of keyboard shortcuts (press ?). New keys: J and L skip 10 seconds, the arrow keys skip 5 seconds and change the volume, 0 to 9 jump through the video, < and > change the speed, Shift+N and Shift+P go to the next and previous video, and , and . step one frame while paused.
- A Fill button crops the picture to fill the frame (and back to Fit), and the video keeps its own volume, separate from music's.
- The Aurora wallpaper can hang from the top of the screen or rise from the bottom. When Aurora is picked, a small Top / Bottom switch appears under it in Settings → Appearance. From the bottom, it glows up from behind the dock and stays there as you scroll.
- Wallpapers can now show on any page. In Settings → Appearance, pick Home, every page, or a different wallpaper for each page, and choose whether it stays below the top bar or fills the whole page behind the title too. The palette's wallpaper commands change the page you're on.
- Videos can now come from a whole folder. In Media → Videos, press Open a folder and every video in it (and in the folders inside it) joins your list in name order, so episodes line up as Ep 1, Ep 2 … Ep 10. They play from where they are; nothing is uploaded. The video list now scrolls on its own beside the player, the way the music list does, instead of the whole page scrolling.
- The next and previous keys on your keyboard or headset now move between videos in your list, and the list scrolls to keep the one playing in view. Each video keeps its place when you move on. Links to YouTube and other sites are skipped, since their players don't listen to those keys.
- You choose what happens when you open a video you've already started. By default it asks: the video waits on the spot where you stopped, with Resume and Start over (pressing play resumes). Settings → Sound can make it always resume or always start over instead.
- Hovering the music progress bar shows the time you'd jump to, and dragging it shows where you'll land. Its round handle only appears while you point at it, drag it or move it with the keyboard.
- A song without cover art gets a live backdrop in the now-playing card: a glow in your accent colour that rises from the bottom and moves with the music, then settles when you pause. Settings → Sound sets how bright it is (or turns it off) and how much the music moves it.
- The Media icon in the sidebar, the dock and the phone tab bar turns into a music note while a song is in the player, and back into the clapperboard when music stops.
- An OPay account shows the OPay logo in your accounts list and in Money's breakdown by account, instead of the plain bank icon.
- A new Media app. Open a video or audio file from your computer, drop one onto the page, or paste a link, and it plays right there.
- Links from YouTube, Vimeo, SoundCloud and Spotify play inside Wanheda. A link straight to a video or audio file plays too.
- Files that browsers usually refuse, such as MPEG-TS recordings, are converted while they play, with nothing saved to disk. If converting takes more than a second, the island shows it, with a way to cancel.
- When a file can't play, Media says which track and which format is the problem (for example Dolby Digital audio), instead of playing silent video.
- Your media list follows you to every device. A file itself never leaves the computer it's on: open the same file on another device and it links back to the same entry.
- Search (Ctrl+K) lists your recent media, so you can play one from anywhere.
- Videos pick up where you left off, on any device. Anything you finish is marked as watched and starts from the beginning next time.
- A Continue list shows what you're partway through, and Watch later keeps a queue of things to see. Add an item with the bookmark button.
- Add subtitles to a video: drop an .srt or .vtt file on the player, or press Add subtitles.
- Theatre mode makes the video fill the width of the page. Press T, or use the Theatre button.
- While a video plays, Search (Ctrl+K) has player controls: play and pause, skip 10 seconds, speed, picture-in-picture, fullscreen and theatre. Each shows its keyboard shortcut.
- Your keyboard's media keys control whichever of video and read-aloud you started last, and starting one pauses the other.
- Media now has a Music tab. Pick the folder your music lives in and Wanheda lists it by artist, album, genre or folder, with album covers. Nothing is uploaded.
- Search your music by song, artist or album, in the Music tab or from Search (Ctrl+K).
- The music folder is remembered. If the browser asks again after a restart, one Reconnect click brings it back, and new or changed files are picked up automatically.
- Files that can't be read are skipped and counted instead of stopping the scan, and the island shows progress while new music is being read.
- Music plays. Click a song and it starts, with the rest of the list queued after it. Albums play without a gap between tracks.
- Shuffle and repeat (the whole queue, or one song). Previous restarts a song you're a few seconds into.
- While music plays, the island shows the album art and an equalizer that moves with the music. Open it for a player card with a wave progress bar you can drag to seek, play, pause and skip, and a volume slider with mute.
- A Music player window has the same card, shuffle and repeat, and an Up next list you can jump around in. Open it from the dock or Search (Ctrl+K).
- A Now playing widget for Home. With nothing playing, it can shuffle your whole library in one press.
- The keyboard's media keys and headset buttons control music: play, pause, next and previous.
- Settings has a new Sound section: choose what happens when read-aloud starts over music or a video. It can pause the other, lower it while speech plays, or play both. Music and a video always pause each other.
- Search (Ctrl+K) controls music while it plays: play and pause, next, previous, shuffle, repeat, volume, mute and stop. Picking a song from Search plays it, with its album queued after it.
- The Music tab now opens on Songs.
- Password-protected PDFs now open in the Reader, like the bank statements many banks send. Enter the password once, and Wanheda remembers it on this device only (untick “Remember on this device” to be asked every time). The password is never synced or sent anywhere. Covers, page counts, find and read-aloud work once it’s unlocked.

### Changed

- The mouse wheel now turns every slider: the volume on the now-playing bar and in the read-aloud window, the music and video seek bars (5 seconds a notch), and the auto-scroll speed in Settings → Reader. Scrolling the page past a slider still scrolls the page.
- When read-aloud (or another video or song) pauses your music or a video, the sound now fades out instead of cutting off. When the reading stops, it fades back in to your volume.
- While the Reader is reading aloud, clicking Reader in the dock brings back the floating read-aloud card (or brings it to the front) instead of leaving your book for the library.
- On Media Home, Recently played albums now show their cover edge to edge, the same as Most played songs, instead of a smaller cover inside a blurred frame.
- The "you stopped at" question over a video is now frosted glass, so the picture behind it no longer shows through the words.
- On Money and Income, the tabs at the top now sit closer to the page they switch.
- In the light Bench theme, cards are now a soft grey that stands out from the white page behind them, the same way they do in dark mode.
- Amount fields in Money and Income are smarter. They only take what can be part of an amount, so stray letters can't get in, and they add the thousands commas as you type. Short forms and sums work: type `20k`, `1.5m` or `2.5k + 800` and the line under the field shows what it comes to, then the field fills it in when you leave it. Pasting `₦20,000.00`, `US$ 1,000` or a statement's `(1,234.50)` just works. The arrow keys nudge the amount up or down (hold Shift for steps of 10), and an opening balance has a ± button to make it negative, handy on a phone keyboard with no minus key.

### Fixed

- With Settings → Sound on "Pause the other", music or a video that read-aloud paused now plays again when you pause or stop the reading, or it reaches the end. Before, it stayed paused. When the sleep timer pauses the reading, the music stays paused, and if you play or stop the music yourself in the meantime, your choice wins.
- Settings → Sound's cards have room between them again, like every other settings page, instead of being stacked edge to edge.
- Money's Spent, Received and Net totals no longer spill out of their cards in a narrower window. They stay one per row until there's room for three across, and then the amounts size themselves to fit.
- Short videos now pick up where you left off. Before, a clip under about 40 seconds always started from the beginning even though its row showed a progress bar, and a row now only shows a bar when the video will really continue from there.
- The music list now fills the space under its tabs and scrolls on its own, so the page no longer scrolls with it.
- The music progress bar glides smoothly as a song plays instead of stepping forward, and a click on it lands exactly where you clicked.
- Opening an album in Music after scrolling the Albums list no longer leaves the first song faded out, and the album now opens at its first song.
- In dark mode the island now has a soft glow like the Wanheda logo's, so it no longer disappears against the page.
- The mouse wheel turns the music volume up and down when the pointer is over the volume control, and the page behind no longer scrolls while you do it.
- The island opens and closes with a smoother, springier glide instead of a snap, and closes a little quicker than it opens.
- On a narrow phone, apps that don't fit on the bottom bar open from a More button above it, with large rows for your thumb. The page you're on always stays on the bar.
- Picking a page from a menu (More, or Settings in the account menu) now closes the menu.
- On a wide screen, each app's title and the show-amounts button now sit on the same line as the island, like a title bar. In Money and Income the tabs sit just below the island instead of crowding it. On a narrower screen the tabs take their own line under the title.

## [0.6.0] - 2026-11-07

### Added

- The reader reads aloud. Press "Read aloud from here" in either reader, in book or scroll view, and it starts at the sentence you're looking at. The spoken sentence is highlighted and the page follows it.
- Scroll or turn the page yourself while it reads and the page stops following; a "Back to the voice" arrow points to where the voice is, and one click brings you back. While the page follows the voice, your saved place moves with it.
- The first time you play a document, a "Getting text" note shows the progress before the voice starts.
- Notes have a Read aloud button too.
- Natural voices that run on your device and work offline. In Settings › Voices, pick from 14 English Piper voices, filtered by language, quality and what's already downloaded. Each shows its size and licence, and voices not cleared for commercial use are marked. Downloads show progress, can be cancelled and are checked before they're kept; delete has Undo. Set your default voice and speed there. British voices speak with a British accent.
- With no voice downloaded, your browser's built-in voice reads instead.
- While a voice downloads, the island shows its progress.
- While something is being read, the island shows its progress. Open it to see the sentence being spoken, "Sentence n of N", the controls, and a way back to the document or note.
- A Read aloud mini window with the same controls: previous, play or pause, next, stop, and speed, voice and sleep. Open it from the reader bar while it reads, the dock or the palette. Changing the voice mid-read takes effect from the current sentence.
- Sleep timer: 15, 30, 45 or 60 minutes, or the end of the chapter. When it runs out, the reading pauses.
- Media keys and your system's media controls play, pause and skip a sentence, and show what's being read.
- A downloaded voice reads with the internet off, even a whole chapter of a 14,000-page PDF, with no gaps in the audio and the highlight in step with the voice. After an update, open the reader once while online first; until then your browser's voice reads instead.

### Changed

- Your Settings › Reader choices now follow you to your other devices, and Settings shows when they're saved.

## [0.5.0] - 2026-11-06

### Added

- Reader: a new app for your PDFs, Markdown and text files. Drop files in to add them. The files stay on your device and are never uploaded; your library, collections and reading place sync to your other devices.
- The library shows a cover for each document, your progress and when you last opened it, and can be searched and filtered by collection or tag. Edit a document's details, delete with Undo, and pin one to lead the grid with its progress shown as a filling tank. Long titles slide by so you can read them.
- On another device a document says "not on this device". Open the same file there and it links up and opens where you left off.
- PDFs open as a book: the first page as a cover, then two-page spreads with a real page curl, arrows at the edges, find above the book, and a bottom bar with zoom, a grid of every page, a page field, first and last page, and full screen. On wide screens you can read one page at a time instead.
- One tap switches a PDF to a scroll view with selectable text, find and the contents. Both views keep the same place.
- Turn pages with the arrow keys, Page Up and Page Down, Space and Shift+Space, Home and End, or by swiping on a phone. Under reduced motion pages turn instantly, and the book is still there.
- Markdown and text files open as a sheet of paper with the same bars, find and contents, plus previous and next section. Code is highlighted, links to other sites open in a new tab, and footnotes work. They can also be read as a book, and Book or Scroll is remembered for each document.
- Your place is kept by section in Markdown and text, so it stays put when you change the window size or the text size.
- Paper colours: six light and six dark tints for the page, previewed as you move through the menu.
- Auto-scroll with a speed slider (scroll over the button to change the speed). The bars fade while it runs and come back when you move the pointer; the eye button hides them. Searching stops it.
- Zoom keeps the middle of the page in the middle, and a zoomed book can be dragged around with the mouse or a finger without turning the page. A one-page document opens as a single centred page.
- PDFs show their page count in the library and in the reader. A 300-page PDF shows its first page in under half a second.
- Close a document on one device and open it on another: it opens on the same page. If it's already open there, it moves to the newer place when you come back to it.
- Settings › Reader: library covers (the first page or a title card, filling the cover or shown whole), spread or one page, page curl or instant turn, text size, paper and auto-scroll speed, with a live preview of the covers.
- Home "Continue reading" widget, and "Continue <title>" in the palette.

### Changed

- Lists and panels that scroll fade at the edges that have more to scroll.
- The Bench dark skin is darker, and the page background is plain graphite without the measuring grid.

### Fixed

- Home's billing cycle card keeps the subscription you picked in a private window.

## [0.4.0] - 2026-11-06

### Added

- Connect Polar in Settings › Connections to see income from your products. Paste a token (it's checked with Polar first) and the webhook secret, then press Sync now. Your Polar products can be mapped to products in Wanheda, and products can be added or archived (archive has Undo). Disconnect asks before it acts.
- Polar sales arrive as they happen. The same event sent twice is only counted once.
- Income: a new app on the rail. It shows monthly recurring revenue (MRR) and customers over time, how MRR moved each month (new, expansion, reactivation, contraction, churn), a month-by-month bridge, and revenue by product.
- Income tiles for MRR and yearly run rate, net new MRR against last month, customers, average revenue per customer, customer churn, MRR churn, lifetime value and new sign-ups. A figure that can't be worked out yet shows a dash instead of a misleading number.
- Look at one product or all of them, over 6 months, 12 months or all time, in one currency at a time. Your choice survives a reload. Products that only sell one-time purchases still show their revenue.
- A Polar check card compares Wanheda's MRR with Polar's own figures, day by day, and marks any day that is off.
- Income alerts in the notification centre: a new subscriber, a cancellation, a failed payment, and MRR passing a milestone. Alerts from the last 48 hours also show in the island, with Open and Dismiss.
- Net, a second Income tab: income minus spending per month in your base currency, your savings rate, the cash in your open accounts, and your runway (how many months that cash lasts at your recent spending). Polar revenue is shown beside it, never added, so a payout isn't counted twice.
- Goals, a third Income tab: reach an MRR by a date, or save an amount by a date. Each goal shows its progress, where you'll land at your pace of the last 90 days, and whether you're on track or behind. Delete has Undo.
- New Home widgets for MRR and net new this month.
- New palette commands: open a product's income, open net income and runway, open goals, open connections, and rebuild income figures.

## [0.3.0] - 2026-11-05

### Added

- Money: a new app (the $ on the rail) for spending and income. It shows what you spent today and this month and what came in, and lists the newest entries by day, each with its category's emoji and colour. Amounts are stored as whole kobo or cents, never rounded.
- Log spending from anywhere: type `4500 food jollof` into the palette and press Enter. `+50000 salary` logs income, `$12 netflix` uses your dollar account, `@bank` picks an account, `yesterday` backdates it and `#work` tags it.
- Money totals and amounts roll when they change: the digits that changed roll up when the amount rises and down when it falls. Reduced motion shows the new figure at once.
- An add form beside the list (Enter saves and it's ready for the next one), and on phones an Add button that opens a one-thumb sheet with your most-used categories as big buttons.
- Dropdowns in the Money form are frosted glass in every skin, each category with its emoji and colour, with keyboard and type-to-find.
- Edit any entry with the pencil on its row (the editor grows out of the pencil): amount, direction, category, payee, account and day.
- Deleting an entry can be undone: it disappears at once and an Undo button stays up, with a bar in the accent colour counting down the seconds, before anything is deleted. Undo or closing the toast keeps the entry. Hovering a toast pauses it.
- Picking a day opens a calendar (arrow keys move by day and week, Page Up and Page Down by month) with Today, Yesterday and 2 days ago one tap away.
- The palette's highlight fades when the pointer leaves the list and comes back when you type or use the arrow keys, so Enter never runs a row you can't see.

- Money works on a period: today, this week, this month or any range you pick. Spent, Received and Net are compared with the same days of the period before, so a running month is set against the same number of days last month.
- Money Analytics, its own tab beside Entries: spending over time, a "spent so far" line against the last period, a calendar heatmap of daily spending, and totals ranked by category, account or payee. Tap a total to see just those entries. Every chart works with the keyboard and has a table version.
- Accounts with balances: add, edit and archive them (archive has Undo). Entries can be searched, and the list stays fast with thousands of them.
- Money works offline too. Entries, edits and deletes are kept on the device and sent in order when you're back online, so an entry made with no signal is never lost. The sync chip counts them.
- Subscriptions, a third Money tab: what you pay per month and per year, the next renewal, everything you pay for ranked by monthly cost, and a timeline of the next 60 days. Add, edit, pause, resume, cancel or delete one; cancel and delete have Undo. A subscription that renews on the 31st keeps renewing at the end of each month, even after you change its cycle.
- Renewal and trial-end reminders: a few days before (3 by default), a reminder lands in the notification centre and in the island. Reminders give the date, not the amount.
- The billing cycle card: with one subscription it fills like a tank of liquid as the renewal gets closer; with several it shows rings.
- Import a bank statement: drop a CSV or Excel file on Money › Import, pick the account, check the columns and the preview, and confirm. The file is read on your device and never uploaded. Twelve bank formats are known (among them GTBank, Kuda, OPay, Moniepoint, Chase and American Express), and the columns you set are remembered for that bank. PDF statements aren't supported yet.
- Importing is safe to repeat: the preview marks each row as new or already here, the same file twice says "already imported on" its date, and an overlapping statement only adds the rows you don't have. You can undo a whole import.
- Subscriptions suggests charges that look recurring (same payee, about the same amount, about the same gap, three times or more). One click adds it; Dismiss has Undo.
- Budgets: one for the whole month and one per category, with an option to carry last month's leftover or overspend. At 80 % and 100 % you get an alert in the centre and the island, and the "spent so far" chart shows the budget line.
- Rules: "payee contains X" sets a category and tags. The first matching rule wins, you can reorder them and switch them off, and the form shows how many recent entries a rule would match. Rules fill in new entries you leave uncategorised and every imported row.
- More than one currency: rates are fetched daily, and the headline totals are shown in your base currency with the original amounts underneath. Analytics can show everything in your base currency or one currency at a time. Set the base currency in Settings › Money (it starts as naira).
- Privacy mode hides every amount behind dots (₦••••). Turn it on with H, the eye in the top bar, the palette or Settings › Money. It's kept on this device and applies before the page shows, so no amount flashes on load.
- Export your money data from Settings › Money as CSV (entries) or JSON (everything).
- New Home widgets: spent today, budgets, and the billing cycle card. With several subscriptions, pick which one the card shows.
- Choosing "Other" as a category lets you name a new one on the spot.
- Delete a notification from the bell: press the bin, then confirm. A deleted alert stays gone even if the same thing happens again.

### Changed

- Amounts, percentages and the clock use JetBrains Mono, so the digits line up.
- Digits next to a ₦ sign are drawn larger to match it.
- On phones, the Money totals are one short row each, so your entries start on the first screen. Each day of entries is its own card.
- Both dark skins are flat: no card borders and no glass edges. Only the dock keeps an edge and a shadow, and the dock's shadow in dark skins is stronger. Cards still lift on hover, without a shadow.
- On phones, page tabs move under the title instead of squeezing it.

### Fixed

- Amounts with a ₦ sign line up with the rest of the text instead of sitting higher.
## [0.2.0] - 2026-11-05

### Added

- Notes: a new app on the rail with your notes listed beside a Markdown editor. Checklists tick right on the note, and each note can have a colour, tags and a pin. Old notes go to the Archive.
- Capture a note from anywhere: type `note buy SSD` into the palette and press Enter. The palette also searches the words inside your notes from any page, and has New note.
- Notes work offline. What you write is kept on the device and sent when you're back online, even if you close the tab first. A chip by the page title shows "Offline · 1 waiting" or "Syncing" until everything is saved.
- If the same note was changed on two devices, the later edit wins and a toast tells you. The other version is never lost: open History in the editor to see every earlier version, and restore any of them.
- The notes board: switch Notes to Board to see your notes as sticky notes on a canvas you can pan and zoom (scroll to pan, Ctrl/⌘ + scroll or pinch to zoom). Drag a sticky to move it and pull its corner to resize it; both snap to a grid and are saved like any edit, so the board looks the same on every device.
- On the board, a focused sticky moves with the arrow keys and resizes with Shift + arrows. Enter opens it and Escape steps back. Stickies show their checklist progress, and moving one never clashes with a text edit made on another device.
- Open a note in its own mini window over any app, with a note picker inside, from the palette ("Open the note window"). The palette also has "Open notes board".
- Home's quick note is now Pinned notes: it shows the notes you pin. If you had typed something in the old quick note, it offers to keep it as a real note, once.
- Empty pages show the Wanheda mark, which leans gently toward your pointer. It holds still under reduced motion.

### Changed

- Moving between apps is instant: a page shows what's already on your device at once and refreshes in the background, instead of a loading skeleton on every hop.
- Page titles use Figtree, in heavy uppercase.
- Every button, link and control shows the hand cursor.

### Fixed

- The Settings section pill slides straight to the section you pick instead of jumping.
- Moving a Home widget with the keyboard and leaving the page right away keeps the move.
- The highlighted item in menus is visible in the Ember light theme.

## [0.1.0] - 2026-11-05

### Added

- Phase 0 foundation: Next.js 16 app scaffold with the Ember (light) and Nebula (dark) skins.
- Security rails: worm tripwire, forged-commit check and gitleaks, in a pre-commit hook and in CI.
- Owner-only sign-in: GitHub for the first sign-in, then passkeys. Only emails in `OWNER_EMAILS` can get an account.
- Gate modes: with no database and no sign-in configured the app runs open on seed data (demo); with a database but no sign-in every page answers 503 (locked); with sign-in configured every page needs the owner (gated).
- `/login` page and a placeholder home with add passkey, sign out and a theme toggle.
- Switching between Ember and Nebula grows the new skin as a circle from the theme toggle. Reduced motion switches instantly.
- Live at https://wanheda-chi.vercel.app (Vercel, Frankfurt), with GitHub and passkey sign-in for the owner. Only `main` deploys; other branches get no preview deployment.
- Sign-in tokens from GitHub are stored encrypted.
- The shell: a nav rail that widens from 84 px to 232 px to show labels (press `[` to toggle), and it remembers its width without a flash on load. On phones it becomes a floating tab bar.
- An account menu on the rail with settings and sign out, and a Settings page for the theme and passkeys.
- Command palette (Ctrl/⌘K, `/`, the search pill, or the search button on phones): open apps, switch theme, toggle the sidebar, and start timers. Type a length like `25`, `90s` or `1h30` to start one.
- The dynamic island: running timers live in a black pill at the top of the screen. Tap it for pause, +5 min and cancel; arrow keys switch between timers. Timers keep running across pages, reloads and other tabs.
- The home board: clock, weather, today and a quick note, arranged on a grid. Press Edit board to drag, resize (corner, or Shift+arrows on the grip), add and remove widgets; the layout is saved per screen size. Set `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` and `WEATHER_PLACE` for live weather from Open-Meteo.
- The dock: Home and the timer at the bottom of the screen on desktop, swelling under the pointer, with a dot on whatever is running, and the search pill at its end.
- Mini windows: open the timer window from the dock or the palette ("timers window"). Drag it by its title bar, resize it from the corner (or the grip: arrows move, Shift+arrows resize, Escape closes); it snaps to an edge when dropped near one, and keeps its place on this device.
- Timers: starting a length that is already running brings that timer forward instead of starting a twin (a finished one starts over). Settings → Timers can allow repeats instead; repeats are numbered ("25 min timer 2").
- Settings → Appearance: pick a skin (Ember & Nebula, or Motion Garden's graphite Bench), any accent colour (presets or a free colour picker; its lightness is adjusted per theme so text stays readable), and a live Home wallpaper (Aurora, Contour, Stars or Dots) drawn in the skin and accent, which reacts to the pointer and holds still under reduced motion. They follow you to other devices, and load without a flash.
- Notification centre: the bell on the rail (or "Open notifications" in the palette) lists past alerts with read and unread, a filter and Mark all read. Finished timers raise an alert, once even with two tabs open.
- Settings in a new layout: sections on the left (Appearance, Timers, Keyboard, Account), cards on the right, and a list you tap into on phones. Appearance opens with a preview in your skin and accent, and the theme is now System, Ember or Nebula. Keyboard lists every shortcut.
- The palette reaches every command: edit the board (from any page), skin, accent, wallpaper and repeat timers (type "skin", "accent" and so on), mark all notifications read, and sign out.

### Fixed

- The last card on a page no longer sits under the dock or the phone tab bar.
- The rail stays put on pages taller than the screen instead of scrolling away.
- Coming back to Home no longer leaves the board in edit mode.
