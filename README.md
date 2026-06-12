# Discord Event Spammer

Automatically creates and activates scheduled events in all voice and stage channels of a target Discord server. Built for reliability on large servers and multi-token setups.

## 📷 Preview

<img width="1534" height="899" alt="image" src="https://github.com/user-attachments/assets/8392190a-89dd-4d08-874b-2d5cbc947a48" />

## 🚀 Features

- **REST API Mode:** Direct HTTP calls to Discord's API — no Gateway connection required.
- **Voice + Stage Channels:** Supports both standard voice channels (type 2) and stage channels (type 13).
- **Configurable Delays:** Control pacing via `delayBetweenChannels` and `delayAfterEvent` in `config.json` to avoid rate limits.
- **100 Event Limit Awareness:** Checks existing scheduled events before starting and stops when Discord's per-server limit is reached.
- **Smart Token Distribution:** Channels are split across tokens (Token 1 → first block, Token 2 → next block, etc.) and processed sequentially — no overlapping requests.
- **Per-Token Fingerprints:** Each token gets randomized `User-Agent` and `X-Super-Properties` values to reduce detection risk.
- **Safe Error Handling:** Gracefully handles non-JSON responses (e.g. Cloudflare HTML blocks) without crashing.
- **Rate-Limit Handling:** Automatically waits and retries when Discord returns `429`.
- **Interactive CLI:** ASCII art banner and a user-friendly terminal interface.

## ⚙️ Installation

1. **Install dependencies:**
```bash
npm install
```
*(Requires Node 18+ for native fetch, or `npm i undici` on older versions.)*

2. **Setup `tokens.txt`:**
Create a `tokens.txt` file and add one Discord token per line.
```txt
token1_here
token2_here
token3_here
```

3. **Setup `config.json`:**
```json
{
  "eventMessage": "Event Name Here",
  "guildId": "Server ID Here",
  "delayBetweenChannels": 1500,
  "delayAfterEvent": 800
}
```

| Field | Description | Default |
|---|---|---|
| `eventMessage` | Name/description of the created events | `🎉 Event` |
| `guildId` | Target server ID | — |
| `delayBetweenChannels` | Wait time (ms) between processing each channel | `1000` |
| `delayAfterEvent` | Wait time (ms) after creating and activating each event | `500` |

> For large servers or multiple tokens, use delays of at least `1000–2000ms`. Setting both to `0` removes all pacing.

## 📝 Usage

Start the tool:
```bash
node .
```

1. An ASCII banner is displayed.
2. You are asked: `Do you want to use config.json? (y/n)`.
3. If `n`, enter the **Guild ID** and **Event Message** manually.
4. The tool scans the server, reports voice/stage channel counts and available event slots, assigns channels to each token, then processes them sequentially.

### Multi-Token Example

With 30 channels and 3 tokens:
- Token 1 → channels 1–10
- Token 2 → channels 11–20
- Token 3 → channels 21–30

Tokens run one after another, not in parallel.

## ⚠️ Important Notes

- Using selfbots and spamming APIs is against Discord's Terms of Service.
- Your accounts (tokens) may get banned by Discord's anti-abuse systems.
- The responsibility belongs entirely to the user.
- **Never share your tokens or upload them to GitHub.**
