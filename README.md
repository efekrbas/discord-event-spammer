# Discord Event Spam Bot

This bot automatically creates events in all voice channels on your specified Discord server.

## 🚀 Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Setup `config.json`:**
   - `token`: Your Discord user token (for selfbot usage)
     - To get your token: Open Discord in your browser → F12 (Developer Tools) → Network tab → Perform any action (like sending a message) → Find a request and copy the token from the `authorization` header.
   - `delayBetweenChannels`: Wait time between channels (in milliseconds)
   - `delayAfterEvent`: Wait time after each event (in milliseconds)
   - *Note: You no longer need to specify `guildId` or `eventMessage` in `config.json`, as the bot will ask for them directly in the terminal.*

## 📝 Usage

```bash
npm start
```

When you start the bot, it will:
1. Ask you for the **Guild ID** (Server ID).
2. Ask you for the **Event Message**.
3. Find all voice channels in the specified server.
4. Create an event in each channel sequentially.

## ⚠️ Important Notes

- This bot operates on your Discord user account (selfbot).
- Using selfbots may be against Discord's Terms of Service.
- The responsibility belongs entirely to the user.
- **Never share your token or upload it to GitHub.**

## 🔧 Configuration

Example `config.json` file:

```json
{
  "token": "your_discord_user_token_here",
  "delayBetweenChannels": 2000,
  "delayAfterEvent": 3000
}
```

**How to get your Token:**
1. Open Discord in your browser (Chrome/Edge).
2. Press F12 to open Developer Tools.
3. Go to the Network tab.
4. Do any action in Discord (send a message, switch channels, etc.).
5. Select a request in the Network tab.
6. Find the `authorization` header in the Headers section.
7. Copy the token and paste it into the `token` field in `config.json` or `tokens.txt` if using multiple accounts.

## 📦 Dependencies

- `discord.js-selfbot-v13`: Discord selfbot library
