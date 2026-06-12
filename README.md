# Discord Event Spam Bot

This powerful bot automatically blasts events in all voice channels across your specified Discord server simultaneously for maximum speed.

## 📷 Preview

<img width="1534" height="899" alt="Ekran görüntüsü 2026-06-12 070629" src="https://github.com/user-attachments/assets/6d931f47-12b7-4622-9840-680e6468e238" />

## 🚀 Features

- **Super-Fast REST Mode:** Uses direct HTTP REST API calls instead of waiting for Discord Gateway, making it insanely fast.
- **Parallel Processing:** Blasts events to all voice channels simultaneously (`Promise.all`), not one by one.
- **Smart Rate-Limit Handling:** Automatically pauses only the affected requests when Discord rate limits are hit, keeping the rest of the spam going at full speed.
- **Multi-Token Support:** Run multiple accounts at the exact same time without them blocking each other.
- **Interactive CLI:** Beautiful ASCII art banner and a user-friendly terminal interface.

## ⚙️ Installation

1. **Install dependencies:**
```bash
npm install
```
*(Note: Requires Node 18+ for native fetch support, or `npm i undici` if on older versions).*

2. **Setup `tokens.txt`:**
Create a file named `tokens.txt` in the main folder and paste your Discord tokens (one per line).
```txt
token1_here
token2_here
token3_here
```

3. **Setup `config.json` (Optional):**
You can define your target Server ID and Event Message here.
```json
{
  "eventMessage": "discord.gg/cecen",
  "guildId": "123456789012345678",
  "delayBetweenChannels": 0,
  "delayAfterEvent": 0
}
```

## 📝 Usage

Start the bot with:
```bash
node .
```

When you start the bot:
1. You will be greeted with an ASCII banner.
2. The bot will ask: `Do you want to use config.json? (y/n)`.
3. If you say `n` (No), it will ask for the **Guild ID** and **Event Message** directly in the console.
4. The bot will find all voice channels and blast them with events instantly!

## ⚠️ Important Notes

- Using selfbots and spamming APIs is against Discord's Terms of Service.
- Your accounts (tokens) might get banned by Discord's Anti-Raid systems.
- The responsibility belongs entirely to the user.
- **Never share your tokens or upload them to GitHub.**
