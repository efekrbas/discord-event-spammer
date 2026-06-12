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

const MAX_SCHEDULED_EVENTS = 100;

// Global Configuration
let config = {};
try {
    if (fs.existsSync('config.json')) {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    }
} catch (e) {
    console.error('⚠️ Could not parse config.json, using defaults.');
}

config.delayBetweenChannels = config.delayBetweenChannels ?? 1000;
config.delayAfterEvent = config.delayAfterEvent ?? 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createTokenFingerprint() {
    const osVersions = ['10.0.19045', '10.0.22621', '10.0.26200'];
    const chromeMajor = randomInt(130, 136);
    const chromeMinor = randomInt(0, 9999);
    const chromePatch = randomInt(100, 250);
    const electronMajor = randomInt(33, 36);
    const electronMinor = randomInt(0, 5);
    const osVersion = pickRandom(osVersions);
    const locale = pickRandom(['tr', 'en-US', 'en-GB', 'de']);
    const timezone = pickRandom(['Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'America/New_York']);

    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.${randomInt(9000, 9300)} Chrome/${chromeMajor}.0.${chromeMinor}.${chromePatch} Electron/${electronMajor}.${electronMinor}.0 Safari/537.36`;

    const superProps = {
        os: 'Windows',
        browser: 'Discord Client',
        release_channel: 'stable',
        client_version: `1.0.${randomInt(9000, 9300)}`,
        os_version: osVersion,
        os_arch: 'x64',
        app_arch: 'x64',
        system_locale: locale,
        has_client_mods: false,
        client_launch_id: randomUUID(),
        browser_user_agent: userAgent,
        browser_version: `${electronMajor}.${electronMinor}.0`,
        os_sdk_version: osVersion.split('.')[0] + osVersion.replace(/\./g, '').slice(1, 5),
        client_build_number: randomInt(450000, 470000),
        native_build_number: randomInt(70000, 72000),
        client_event_source: null,
        launch_signature: randomUUID(),
        client_heartbeat_session_id: randomUUID(),
        client_app_state: 'focused'
    };

    return {
        userAgent,
        superProperties: Buffer.from(JSON.stringify(superProps)).toString('base64'),
        locale,
        timezone
    };
}

async function safeJson(response) {
    try {
        const text = await response.text();
        if (!text || text.trim().startsWith('<')) return null;
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function isVoiceOrStageChannel(c) {
    if (!c) return false;
    const type = c.type;
    return type === 2 || type === 13 ||
        type === 'GUILD_VOICE' || type === 'VOICE' ||
        type === 'GUILD_STAGE_VOICE' || type === 'STAGE';
}

function isMaxEventsError(status, errorData) {
    if (status !== 400 || !errorData) return false;
    const message = (errorData.message || '').toLowerCase();
    return message.includes('maximum number of scheduled events') ||
        message.includes('scheduled events reached') ||
        errorData.code === 300039;
}

const getHeaders = (token, guildId, fingerprint) => ({
    'Authorization': token,
    'Content-Type': 'application/json',
    'User-Agent': fingerprint.userAgent,
    'X-Super-Properties': fingerprint.superProperties,
    'X-Discord-Locale': fingerprint.locale,
    'X-Discord-Timezone': fingerprint.timezone,
    'Origin': 'https://discord.com',
    'Referer': `https://discord.com/channels/${guildId}`
});

function distributeChannels(channels, tokenCount) {
    const chunkSize = Math.ceil(channels.length / tokenCount);
    return Array.from({ length: tokenCount }, (_, i) =>
        channels.slice(i * chunkSize, (i + 1) * chunkSize)
    );
}

async function fetchGuildInfo(guildId, token, fingerprint) {
    const guildResp = await fetch(`https://discord.com/api/v9/guilds/${guildId}`, {
        headers: getHeaders(token, guildId, fingerprint)
    });

    if (!guildResp.ok) {
        return { error: `Failed to fetch server (${guildResp.status})` };
    }

    const guild = await safeJson(guildResp);
    if (!guild) {
        return { error: 'Server response could not be parsed (possible Cloudflare block)' };
    }

    return { guild };
}

async function fetchVoiceChannels(guildId, token, fingerprint) {
    const channelsResp = await fetch(`https://discord.com/api/v9/guilds/${guildId}/channels`, {
        headers: getHeaders(token, guildId, fingerprint)
    });

    if (!channelsResp.ok) {
        return { error: `Failed to fetch channel list (${channelsResp.status})` };
    }

    const channels = await safeJson(channelsResp);
    if (!channels) {
        return { error: 'Channel list could not be parsed (possible Cloudflare block)' };
    }

    const voiceChannels = channels.filter(isVoiceOrStageChannel);
    const stageCount = channels.filter(c => c && (c.type === 13 || c.type === 'GUILD_STAGE_VOICE' || c.type === 'STAGE')).length;
    const voiceCount = voiceChannels.length - stageCount;

    return { voiceChannels, voiceCount, stageCount };
}

async function fetchExistingEventCount(guildId, token, fingerprint) {
    const eventsResp = await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events`, {
        headers: getHeaders(token, guildId, fingerprint)
    });

    if (!eventsResp.ok) {
        return { error: `Failed to fetch scheduled events (${eventsResp.status})`, count: 0 };
    }

    const events = await safeJson(eventsResp);
    if (!events) {
        return { error: 'Scheduled events response could not be parsed', count: 0 };
    }

    return { count: Array.isArray(events) ? events.length : 0 };
}

async function processChannel(channel, guildId, token, tokenIndex, fingerprint) {
    const channelIdString = String(channel.id);
    let event = null;
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const startTime = new Date(Date.now() + 5000);
        const eventData = {
            name: config.eventMessage || '🎉 Event',
            description: config.eventMessage || '',
            scheduled_start_time: startTime.toISOString(),
            privacy_level: 2,
            entity_type: 2,
            channel_id: channelIdString,
            recurrence_rule: null
        };

        const response = await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events`, {
            method: 'POST',
            headers: getHeaders(token, guildId, fingerprint),
            body: JSON.stringify(eventData)
        });

        if (response.status === 429) {
            const errorData = await safeJson(response);
            const retryAfter = ((errorData && errorData.retry_after) || 1) * 1000;
            console.log(`[Token ${tokenIndex}] ⏳ Rate limited, waiting ${retryAfter}ms...`);
            await sleep(retryAfter);
            retryCount++;
            continue;
        }

        if (response.status === 403) {
            console.log(`[Token ${tokenIndex}] ⚠️ Permission error in channel ${channel.name}`);
            return null;
        }

        const responseData = await safeJson(response);

        if (isMaxEventsError(response.status, responseData)) {
            console.log(`[Token ${tokenIndex}] 🛑 Maximum scheduled events limit (${MAX_SCHEDULED_EVENTS}) reached.`);
            return 'MAX_REACHED';
        }

        if (!response.ok) {
            const errMsg = responseData?.message || response.status;
            console.log(`[Token ${tokenIndex}] ❌ API error in ${channel.name}: ${errMsg}`);
            return null;
        }

        event = responseData;
        const channelType = (channel.type === 13 || channel.type === 'GUILD_STAGE_VOICE' || channel.type === 'STAGE') ? 'Stage' : 'Voice';
        console.log(`[Token ${tokenIndex}] ✅ Created event in [${channelType}] ${channel.name}: ${event.name}`);
        break;
    }

    if (!event) return null;

    const startResponse = await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events/${event.id}`, {
        method: 'PATCH',
        headers: getHeaders(token, guildId, fingerprint),
        body: JSON.stringify({ status: 2 })
    });

    if (startResponse.ok) {
        console.log(`[Token ${tokenIndex}] 🚀 Event activated in ${channel.name}!`);
    } else if (startResponse.status === 429) {
        const errorData = await safeJson(startResponse);
        const retryAfter = ((errorData && errorData.retry_after) || 1) * 1000;
        await sleep(retryAfter);
        await fetch(`https://discord.com/api/v9/guilds/${guildId}/scheduled-events/${event.id}`, {
            method: 'PATCH',
            headers: getHeaders(token, guildId, fingerprint),
            body: JSON.stringify({ status: 2 })
        });
    } else {
        const errData = await safeJson(startResponse);
        console.log(`[Token ${tokenIndex}] ⚠️ Could not activate event in ${channel.name}: ${errData?.message || startResponse.status}`);
    }

    if (config.delayAfterEvent > 0) {
        await sleep(config.delayAfterEvent);
    }

    return 'OK';
}

async function processTokenChannels(token, tokenIndex, totalTokens, channels, guildId, fingerprint) {
    console.log(`\n[Token ${tokenIndex}/${totalTokens}] ⚡ Processing ${channels.length} assigned channel(s)...`);

    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        try {
            const result = await processChannel(channel, guildId, token, tokenIndex, fingerprint);
            if (result === 'MAX_REACHED') {
                return 'MAX_REACHED';
            }
        } catch (error) {
            console.error(`[Token ${tokenIndex}] ❌ Error in channel ${channel.name}: ${error.message}`);
        }

        if (i < channels.length - 1 && config.delayBetweenChannels > 0) {
            await sleep(config.delayBetweenChannels);
        }
    }

    console.log(`[Token ${tokenIndex}/${totalTokens}] ✅ Assigned channels completed.`);
    return 'OK';
}

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
        while (true) {
            config.guildId = await askQuestion('Enter Guild ID: ');
            config.guildId = config.guildId.trim();
            if (/^\d+$/.test(config.guildId)) {
                break;
            } else {
                console.log('❌ Invalid Guild ID! Guild ID must only contain numbers.');
            }
        }
        config.eventMessage = await askQuestion('Enter Event Message: ');
    } else {
        console.log('Using Guild ID and Event Message from config.json...');
        if (config.guildId) config.guildId = config.guildId.trim();
        if (!config.guildId || !/^\d+$/.test(config.guildId)) {
            console.log('⚠️ Guild ID in config.json is missing or invalid! It must only contain numbers.');
            while (true) {
                config.guildId = await askQuestion('Enter valid Guild ID: ');
                config.guildId = config.guildId.trim();
                if (/^\d+$/.test(config.guildId)) break;
                console.log('❌ Invalid Guild ID! Guild ID must only contain numbers.');
            }
        }
        if (!config.eventMessage) {
            console.log('⚠️ Event Message is missing in config.json! You may encounter errors.');
        }
    }
    readline.close();

    let tokens = [];
    try {
        if (fs.existsSync('tokens.txt')) {
            const tokensContent = fs.readFileSync('tokens.txt', 'utf8');
            tokens = tokensContent
                .split('\n')
                .map(line => line.trim().replace(/^["']|["']$/g, ''))
                .filter(line => line && !line.startsWith('#'));

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

    console.log(`📋 ${tokens.length} token(s) found.`);
    console.log(`⏱️  Delays: ${config.delayBetweenChannels}ms between channels, ${config.delayAfterEvent}ms after each event.\n`);

    const scoutFingerprint = createTokenFingerprint();
    const scoutToken = tokens[0];

    const { guild, error: guildError } = await fetchGuildInfo(config.guildId, scoutToken, scoutFingerprint);
    if (guildError) {
        console.error(`❌ ${guildError}`);
        process.exit(1);
    }
    console.log(`📋 Server: ${guild.name}`);

    const { voiceChannels, voiceCount, stageCount, error: channelError } = await fetchVoiceChannels(config.guildId, scoutToken, scoutFingerprint);
    if (channelError) {
        console.error(`❌ ${channelError}`);
        process.exit(1);
    }

    console.log(`🎤 ${voiceCount} voice + ${stageCount} stage channel(s) found (${voiceChannels.length} total).`);

    if (voiceChannels.length === 0) {
        console.error('❌ No voice or stage channels found or no access permission!');
        process.exit(1);
    }

    const { count: existingEvents, error: eventsError } = await fetchExistingEventCount(config.guildId, scoutToken, scoutFingerprint);
    if (eventsError) {
        console.warn(`⚠️ ${eventsError} — assuming 0 existing events.`);
    }

    const availableSlots = Math.max(0, MAX_SCHEDULED_EVENTS - existingEvents);
    console.log(`📊 Existing events: ${existingEvents}/${MAX_SCHEDULED_EVENTS} — ${availableSlots} slot(s) available.`);

    if (availableSlots === 0) {
        console.error('❌ Server already has the maximum number of scheduled events. Cannot create more.');
        process.exit(1);
    }

    const channelsToProcess = voiceChannels.slice(0, availableSlots);
    if (channelsToProcess.length < voiceChannels.length) {
        console.log(`⚠️ Only processing first ${channelsToProcess.length} channel(s) due to the ${MAX_SCHEDULED_EVENTS} event limit.`);
    }

    const channelChunks = distributeChannels(channelsToProcess, tokens.length);

    channelChunks.forEach((chunk, i) => {
        if (chunk.length > 0) {
            console.log(`   Token ${i + 1}: ${chunk.length} channel(s) assigned`);
        }
    });

    console.log('\n🚀 Starting sequential token processing...\n');

    for (let i = 0; i < tokens.length; i++) {
        const assignedChannels = channelChunks[i];
        if (assignedChannels.length === 0) {
            console.log(`[Token ${i + 1}/${tokens.length}] ⏭️ No channels assigned, skipping.`);
            continue;
        }

        const fingerprint = createTokenFingerprint();
        const result = await processTokenChannels(
            tokens[i], i + 1, tokens.length, assignedChannels, config.guildId, fingerprint
        );

        if (result === 'MAX_REACHED') {
            console.log('\n🛑 Stopping — maximum scheduled events limit reached.');
            break;
        }
    }

    console.log('\n✅ Process completed for all tokens!');
    process.exit(0);
}

main();
