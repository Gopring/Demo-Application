import Client  from './client/client.js';

let client;

async function initializeClient() {
    if (!client) {
        const serverURL = document.getElementById('server_url').value;
        const userID = document.getElementById('user_id').value;
        const channelID = document.getElementById('channel_id').value;
        const video= document.getElementById('video');
        client = new Client(serverURL, userID, channelID, video);
    }
}

async function getMediaStream() {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}


document.getElementById('activate').addEventListener('click', async () => {
    await initializeClient();
    await client.dial();
    await client.activate();
    console.log("Client initialized");
});

document.getElementById('push').addEventListener('click', async () => {
    const stream = await getMediaStream();
    await client.Push(stream);
});

document.getElementById('pull').addEventListener('click', async () => {
    await client.Pull();
});

document.getElementById('fetch').addEventListener('click', async () => {
    await client.Fetch();
});

document.getElementById('forward').addEventListener('click', async () => {
    await client.Forward();
});
