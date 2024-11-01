import {
    createPeerConnection,
    addLocalTracksToPeerConnection,
    makeRequestBody,
    fetchFromServer,
    getUserId,
    getUserName,
    getChannelId,
    getChannelName,
    videoElement, getBaseUrl
} from '../utils/utils.js';

export const startBroadcast = async () => {
    try {
        const userID = getUserId();
        // const userName = getUserName();
        const channelID = getChannelId();
        // const channelName = getChannelName();

        // Get local media (video/audio)
        let localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoElement.srcObject = localStream;

        // Create a new peer connection to the server
        const peerConnection = createPeerConnection();
        addLocalTracksToPeerConnection(peerConnection, localStream);

        // Create an SDP offer to start broadcasting
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send the offer to the server for broadcasting
        const requestBody = makeRequestBody(userID, channelID, offer.sdp);
        const res = await fetchFromServer(getBaseUrl()+"/broadcast", requestBody, userID);

        const sdpAnswer = await res.text();
        const remoteDescription = new RTCSessionDescription({
            type: 'answer',
            sdp: sdpAnswer,
        });
        await peerConnection.setRemoteDescription(remoteDescription);
    } catch (error) {
        console.error('Error broadcasting:', error);
    }
};
