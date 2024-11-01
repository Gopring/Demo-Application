export const videoElement = document.getElementById('videoElement');
export const userIdInput = document.getElementById('userIdInput');
export const userNameInput = document.getElementById('userNameInput');
export const channelIdInput = document.getElementById('channelIdInput');
export const channelNameInput = document.getElementById('channelNameInput');

 let baseUrl = "http://localhost:8080";

export const getUserId = () => {
    let key = userIdInput.value;
    if (!key) {
        key = 'user_' + Math.floor(Math.random() * 10000);
        console.log('Generated User ID:', key);
    }
    return key;
};

export const getUserName = () => {
    let name = userNameInput.value;
    if (!name) {
        name = 'User_' + Math.floor(Math.random() * 10000);
        console.log('Generated User Name:', name);
    }
    return name;
};

export const getChannelId = () => {
    let channelId = channelIdInput.value;
    if (!channelId) {
        channelId = 'channel_' + Math.floor(Math.random() * 10000);
        console.log('Generated Channel ID:', channelId);
    }
    return channelId;
};

export const getChannelName = () => {
    let channelName = channelNameInput.value;
    if (!channelName) {
        channelName = 'Channel_' + Math.floor(Math.random() * 10000);
        console.log('Generated Channel Name:', channelName);
    }
    return channelName;
};

export const getBaseUrl = () => {
    return baseUrl;
};

export const setBaseUrl = (newUrl) => {
    baseUrl=newUrl
};


export const createPeerConnection = () => {
    const config = {
        iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302'
            }
        ]
    };
    return new RTCPeerConnection(config);
};

export const addLocalTracksToPeerConnection = (pc, stream) => {
    stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
    });
};

export const makeRequestBody = (userID, channelID, sdp) => {
    return JSON.stringify({
        "user_id": userID,
        // "user_name": userName,
        "sdp": sdp,
        "channel_id": channelID,
        // "channel_name": channelName
    });
};

export const fetchFromServer = async (url, requestBody, apiKey) => {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'channel-key': apiKey
            },
            body: requestBody
        });
        return await response;
    } catch (error) {
        console.error('Error fetching from server:', error);
        throw error;
    }
};
