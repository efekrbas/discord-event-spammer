const fs = require('fs');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
const askQuestion = (query) => new Promise(resolve => readline.question(query, resolve));

const { fetch: undiciFetch } = (() => {
    try { return require('undici'); } catch (_) { return { fetch: undefined }; }
})();
const fetch = global.fetch || undiciFetch || undefined;

if (!fetch) {
    console.error('❌ fetch is undefined! Use Node 18+ or install undici as a dependency.');
    console.error('   Solution: npm i undici');
    process.exit(1);
}

// Global Configuration
let config = {};
try {
    if (fs.existsSync('config.json')) {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    }
} catch (e) {
    console.error('⚠️ Could not parse config.json, using defaults.');
}

// Helper function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Headers that make requests look like they come from the official Discord client
const getHeaders = (token, guildId) => ({
    'Authorization': token,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9213 Chrome/134.0.6998.205 Electron/35.3.0 Safari/537.36',
    'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC45MjEzIiwib3NfdmVyc2lvbiI6IjEwLjAuMjYyMDAiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoidHIiLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlLCJjbGllbnRfbGF1bmNoX2lkIjoiNGRjZjc5ZTMtNmYxNy00ODU4LWJlMDAtMDEzMWI3Nzc1Y2FmIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgZGlzY29yZC8xLjAuOTIxMyBDaHJvbWUvMTM0LjAuNjk5OC4yMDUgRWxlY3Ryb24vMzUuMy4wIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIzNS4zLjAiLCJvc19zZGtfdmVyc2lvbiI6IjI2MjAwIiwiY2xpZW50X2J1aWxkX251bWJlciI6NDYzMzExLCJuYXRpdmVfYnVpbGRfbnVtYmVyIjo3MTA5MCwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbCwibGF1bmNoX3NpZ25hdHVyZSI6IjUyNmNhOTZjLTc2YzgtNDY5OS04NjBlLTM1MjI4MjA5Yjc2MiIsImNsaWVudF9oZWFydGJlYXRfc2Vzc2lvbl9pZCI6IjBiZjVmY2I1LWQ0NGItNGI5NC1hZDY3LTZhY2Q5MDk0Y2ZlYiIsImNsaWVudF9hcHBfc3RhdGUiOiJmb2N1c2VkIn0=',
    'X-Discord-Locale': 'en-US',
    'X-Discord-Timezone': 'Europe/Istanbul',
    'Origin': 'https://discord.com',
    'Referer': `https://discord.com/channels/${guildId}`
});

// Fast channel processing function
async function processChannelFast(channel, guildId, token, tokenIndex) {
    try {
        const channelIdString = String(channel.id);
        let event = null;
        let maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            const startTime = new Date(Date.now() + 5000); // 5 seconds later
            const eventData = {
                name: config.eventMessage || '🎉 Event',
                description: config.eventMessage || '', 
                scheduled_start_time: startTime.toISOString(),
                privacy_level: 2, // GUILD_ONLY
                entity_type: 2, // VOICE
                channel_id: channelIdString,
                recurrence_rule: null
            };
            
            const response = await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events`, {
                method: 'POST',
                headers: getHeaders(token, guildId),
                body: JSON.stringify(eventData)
            });
            
            if (response.status === 429) {
                const errorData = await response.json();
                const retryAfter = (errorData.retry_after || 1) * 1000;
                await sleep(retryAfter);
                retryCount++;
                continue;
            }
            
            if (response.status === 403) {
                console.log(`[Token ${tokenIndex}] ⚠️ Permission error in channel ${channel.name}`);
                return;
            }
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            event = await response.json();
            console.log(`[Token ${tokenIndex}] ✅ Created event in ${channel.name}: ${event.name}`);
            break;
        }
        
        if (event) {
            // Instantly activate the event
            const startResponse = await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events/${event.id}`, {
                method: 'PATCH',
                headers: getHeaders(token, guildId),
                body: JSON.stringify({ status: 2 }) // ACTIVE
            });
            
            if (startResponse.ok) {
                console.log(`[Token ${tokenIndex}] 🚀 Event activated in ${channel.name}!`);
            } else if (startResponse.status === 429) {
                const errorData = await startResponse.json();
                const retryAfter = (errorData.retry_after || 1) * 1000;
                await sleep(retryAfter);
                await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events/${event.id}`, {
                    method: 'PATCH',
                    headers: getHeaders(token, guildId),
                    body: JSON.stringify({ status: 2 })
                });
            }
        }
    } catch (error) {
        console.error(`[Token ${tokenIndex}] ❌ Error in channel ${channel.name}: ${error.message}`);
    }
}

// Function that performs event spam for a single token
async function startEventSpamFast(token, tokenIndex, totalTokens) {
    try {
        console.log(`\n[Token ${tokenIndex}/${totalTokens}] ⚡ Processing started (Super-Fast REST mode).`);

        if (!config.guildId) {
            console.error(`[Token ${tokenIndex}/${totalTokens}] ❌ Please provide a guildId!`);
            return;
        }

        // Guild info via REST
        const guildResp = await fetch(`https://discord.com/api/v9/guilds/${config.guildId}`, {
            headers: { 'Authorization': token, 'User-Agent': 'Mozilla/5.0' }
        });

        if (!guildResp.ok) {
            console.error(`[Token ${tokenIndex}/${totalTokens}] ❌ Failed to fetch server! Check guildId and access. (${guildResp.status})`);
            return;
        }
        const guild = await guildResp.json();
        console.log(`[Token ${tokenIndex}/${totalTokens}] 📋 Server: ${guild.name}`);

        // Fetch channels via REST
        const channelsResp = await fetch(`https://discord.com/api/v9/guilds/${guild.id}/channels`, {
            headers: { 'Authorization': token, 'User-Agent': 'Mozilla/5.0' }
        });

        if (!channelsResp.ok) {
            console.error(`[Token ${tokenIndex}/${totalTokens}] ❌ Failed to fetch channel list (${channelsResp.status}).`);
            return;
        }
        const channels = await channelsResp.json();
        const voiceChannels = channels.filter(c => c && (c.type === 2 || c.type === 'GUILD_VOICE' || c.type === 'VOICE'));

        console.log(`[Token ${tokenIndex}/${totalTokens}] 🎤 ${voiceChannels.length} voice channels found.`);
        
        if (voiceChannels.length === 0) {
            console.error(`[Token ${tokenIndex}/${totalTokens}] ❌ No voice channels found or no access permission!`);
            return;
        }

        console.log(`[Token ${tokenIndex}/${totalTokens}] 🚀 Blasting events across ${voiceChannels.length} channels simultaneously...\n`);

        // Execute requests in parallel for maximum speed
        await Promise.all(voiceChannels.map(channel => processChannelFast(channel, guild.id, token, tokenIndex)));

        console.log(`\n[Token ${tokenIndex}/${totalTokens}] ✅ Event creation process completed in all channels!`);
    } catch (error) {
        console.error(`[Token ${tokenIndex}/${totalTokens}] ❌ Processing error:`, error.message);
    }
}

// Main process
async function main() {
    console.clear();
    const banner = `     _ _                   _                   _                                       
  __| (_)___ __ ___ _ _ __| |  _____ _____ _ _| |_   ____ __  __ _ _ __  _ __  ___ _ _ 
 / _\` | (_-</ _/ _ \\ '_/ _\` | / -_) V / -_) ' \\  _| (_-< '_ \\/ _\` | '  \\| '  \\/ -_) '_|
 \\__,_|_/__/\\__\\___/_| \\__,_| \\___|\\_/\\___|_||_\\__| /__/ .__/\\__,_|_|_|_|_|_|_\\___|_|  
                                                       |_|                              `;
    console.log('\x1b[36m%s\x1b[0m\n', banner);

    const useConfig = await askQuestion('Do you want to use config.json? (y/n): ');
    if (useConfig.toLowerCase() !== 'y' && useConfig.toLowerCase() !== 'yes') {
        config.guildId = await askQuestion('Enter Guild ID: ');
        config.eventMessage = await askQuestion('Enter Event Message: ');
    } else {
        console.log('Using Guild ID and Event Message from config.json...');
        if (!config.guildId || !config.eventMessage) {

            console.log('⚠️ Guild ID or Event Message is missing in config.json! You may encounter errors.');
        }
    }
    readline.close();

    // Read tokens.txt file
    let tokens = [];
    try {
        if (fs.existsSync('tokens.txt')) {
            const tokensContent = fs.readFileSync('tokens.txt', 'utf8');
            tokens = tokensContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); // Filter empty lines and comments
            
            if (tokens.length === 0) {
                console.error('❌ No valid tokens found in tokens.txt!');
                process.exit(1);
            }
        } else {
            console.error('❌ tokens.txt file not found!');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error reading tokens.txt file:', error.message);
        process.exit(1);
    }

    console.log(`📋 ${tokens.length} tokens found. Fast Event spam process starting...\n`);

    // Execute all tokens simultaneously!
    await Promise.all(tokens.map((token, i) => startEventSpamFast(token, i + 1, tokens.length)));

    console.log('\n✅ Super-Fast Process completed for all tokens!');
    process.exit(0);
}

// Start main process
main();
