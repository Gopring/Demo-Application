import {
    createPeerConnection,
    makeRequestBody,
    fetchFromServer,
    getUserId,
    getChannelId,
    videoElement,
    getBaseUrl
} from '../utils/utils.js';

export const startView = async () => {
    try {
        const userID = getUserId();
        const channelID = getChannelId();

        // Create a new peer connection to connect to the server
        const peerConnection = createPeerConnection();
        peerConnection.addTransceiver('video');

        // Create an offer to receive the stream from the server
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // When a remote track is received, assign it to the video element
        peerConnection.ontrack = function (event) {
            videoElement.srcObject = event.streams[0];
            videoElement.autoplay = true;
            videoElement.controls = true;
        };

        // Send the offer to the server to start viewing
        const requestBody = makeRequestBody(userID, channelID, offer.sdp);
        const res = await fetchFromServer(getBaseUrl() + "/view", requestBody, userID);
        const sdpAnswer = await res.text();

        // Set the server's SDP answer to establish connection
        const remoteDescription = new RTCSessionDescription({
            type: 'answer',
            sdp: sdpAnswer
        });
        await peerConnection.setRemoteDescription(remoteDescription);
    } catch (error) {
        console.error('Error viewing:', error);
    }
};
