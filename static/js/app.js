import Client  from './client/client.js';

let client;


function randomUserID() {
    return Math.random().toString(36).substring(7);
}

async function initializeClient() {
    if (!client) {
        let userID = document.getElementById('user_id').value;
        if (userID==='') {
            userID=randomUserID();
        }
        const channelID = document.getElementById('channel_id').value;
        const video= document.getElementById('video');
        const signalServerURL = window.SignalServerURL;
        console.log("SignalServerURL: ", signalServerURL);
        client = new Client(signalServerURL, userID, channelID, video);
    }
}

async function getMediaStream() {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}

async function init(){
    await initializeClient();
    await client.dial();
    await client.activate();
    console.log("Client initialized");
}

document.getElementById('push').addEventListener('click', async () => {
    await init();
    const stream = await getMediaStream();
    await client.Push(stream);
});

document.getElementById('pull').addEventListener('click', async () => {
    await init();
    await client.Pull();
});

