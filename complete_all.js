import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TOKEN?.trim();
const applicationId = '1555162622104576010';

export async function completeQuest(questId) {
    console.log(`\n========================================`);
    console.log(`[Processing Quest] ID: ${questId}`);
    
    // 1. OAuth2 Authorize
    console.log(`[1/3] Getting OAuth code for app ${applicationId}...`);
    const authUrl = `https://discord.com/api/v9/oauth2/authorize?response_type=code&client_id=${applicationId}&scope=identify+applications.commands+applications.entitlements`;
    const oauthRes = await fetch(authUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            permissions: '0',
            authorize: true,
            integration_type: 1,
            location_context: { guild_id: '10000', channel_id: '10000', channel_type: 10000 }
        })
    }).then(r => r.json());

    if (!oauthRes.location) {
        console.error(`[-] Failed to get OAuth location for ${questId}:`, oauthRes);
        return false;
    }

    const code = new URL(oauthRes.location).searchParams.get('code');
    console.log(`[+] Got OAuth code: ${code}`);

    // 2. Authorize with ACF discordsays
    console.log(`[2/3] Authorizing with discordsays ACF proxy...`);
    const acfAuth = await fetch(`https://${applicationId}.discordsays.com/.proxy/acf/authorize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Discord-Activity-Id': applicationId,
            'X-Discord-Hostname': `${applicationId}.discordsays.com`
        },
        body: JSON.stringify({ code, activityId: applicationId })
    }).then(r => r.json());

    const acfToken = acfAuth?.token;
    if (!acfToken) {
        console.error(`[-] No ACF token received:`, acfAuth);
        return false;
    }
    console.log(`[+] Received ACF token for ${acfAuth.user?.global_name || acfAuth.user?.username}`);

    // 3. Send progress
    console.log(`[3/3] Sending quest progress (target: 3) for quest ${questId}...`);
    const progRes = await fetch(`https://${applicationId}.discordsays.com/.proxy/acf/quest/progress`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': acfToken,
            'X-Discord-Activity-Id': applicationId,
            'X-Discord-Hostname': `${applicationId}.discordsays.com`
        },
        body: JSON.stringify({ progress: 3, quest_id: questId })
    }).then(r => r.json());

    console.log(`[+] Result for ${questId}:`, progRes);
    return progRes?.status === 'ok';
}

const questIds = process.argv.slice(2);
if (questIds.length === 0) {
    console.log('Usage: node complete_all.js <quest_id_1> <quest_id_2> ...');
} else {
    for (const qId of questIds) {
        await completeQuest(qId);
    }
    console.log('\nAll done!');
}
