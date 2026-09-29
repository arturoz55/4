# Hyperpad marketing kit

| File | What it is | Where to use it |
| --- | --- | --- |
| `copy.md` | X bio (EN/ES), launch tweet (EN/ES), six tweets | Profile and posts |
| `article.md` | Long-form article with title | X Articles, blog |
| `hyperpad-launch.mp4` | 16-second launch video, 1080×1080, H.264 | Attach to the launch tweet |
| `images/hyperpad-profile.png` | 400×400 profile picture | X avatar |
| `images/hyperpad-header.png` | 1500×500 banner | X header |
| `images/hyperpad-launch.png` | 1600×900 launch card | Launch tweet alternative |
| `images/hyperpad-how.png` | 1080×1080 how it works + fee split | Tweet 1 |
| `images/hyperpad-reel.png` | 1080×1350 example reel | Tweet 2 |
| `images/hyperpad-zec.png` | 1080×1080 ZEC tips | Tweet 3 |

Fill in `[CA]` and `[link]` before posting. The X account is https://x.com/UseHyperpad. The ticker used throughout is `$HPAD`.

## Regenerating

The video and images are rendered from HTML in `tools/` with Playwright and ffmpeg:

```sh
node marketing/tools/render-images.js
node marketing/tools/render-video.js /tmp/frames /path/to/ffmpeg
```

Edit `tools/images.html` or `tools/video.html` (for example, to change the ticker) and run the commands again.
