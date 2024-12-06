import { MESSAGE_TYPES } from './messageTypes.js';
import { generateShortUUID } from './utils.js';
import { createPeerConnection, setRemoteDescription, addIceCandidate } from './rtc.js';

export default class Client {
    constructor(serverURL, userID, channelID, channelKey, video) {
        this.serverURL = serverURL;
        this.userID = userID;
        this.channelID = channelID;
        this.channelKey = channelKey;
        this.video = video;
        this.socket = null;
        this.mediaStream = null;
        this.connections = {}; // connection_id -> RTCPeerConnection
    }

    async dial() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.serverURL);
            this.socket.onopen = () => resolve();
            this.socket.onerror = (err) => reject(`Failed to connect WebSocket: ${err.message}`);

            this.socket.onmessage = (message) => {
                const data = JSON.parse(message.data);
                this.handleServerMessage(data);
            };
        });
    }

    // Centralize message handling
    handleServerMessage(data) {
        switch (data.type) {
            case MESSAGE_TYPES.ACTIVATE:
                this.ReceiveActivate(data);
                break;
            case MESSAGE_TYPES.EXCHANGE:
                this.ReceiveExchange(data);
                break;
            case MESSAGE_TYPES.FETCH:
                this.ReceiveFetch(data);
                break;
            case MESSAGE_TYPES.FORWARD:
                this.ReceiveForward(data);
                break;
            default:
                console.warn("Received unknown message type:", data);
        }
    }

    // Generic send
    sendToServer(type, payload) {
        const request = { type, payload };
        console.log("Sending request:", request);
        this.socket.send(JSON.stringify(request));
    }

    // Activate
    async SendActivate() {
        const payload = {
            channel_id: this.channelID,
            channel_key: this.channelKey,
            client_id: this.userID
        };
        this.sendToServer(MESSAGE_TYPES.ACTIVATE, payload);
    }

    ReceiveActivate(response) {
        console.log("Received Activate response:", response);
    }

    // Push
    async SendPush(mediaStream) {
        try {
            console.log("Sending Push...");
            this.video.srcObject = mediaStream;

            const connection = createPeerConnection();
            const connectionID = generateShortUUID();
            this.connections[connectionID] = connection;

            // Add all media tracks
            mediaStream.getTracks().forEach(track => connection.addTrack(track, mediaStream));

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            this.sendToServer(MESSAGE_TYPES.PUSH, { sdp: offer.sdp, connection_id: connectionID });
        } catch (error) {
            console.error("Error in Push:", error);
        }
    }

    // Pull
    async SendPull() {
        try {
            const connection = createPeerConnection();
            const connectionID = generateShortUUID();
            this.connections[connectionID] = connection;

            connection.addTransceiver('video');

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
                this.mediaStream = event.streams[0];
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            console.log("Generated Offer SDP for Pull:", offer.sdp);
            await this.sendToServer(MESSAGE_TYPES.PULL, { sdp: offer.sdp, connection_id: connectionID });
            console.log("Pull sent");
        } catch (error) {
            console.error("Error in Pull:", error);
        }
    }

    // Fetch
    async ReceiveFetch(data) {
        try {
            const connID = data.connection_id;
            const connection = createPeerConnection();
            this.connections[connID] = connection;

            connection.addTransceiver('video');

            connection.ontrack = (event) => {
                const fetching = new MediaStream();
                fetching.addTrack(event.track);
                this.video.srcObject = fetching;
                this.mediaStream = fetching;
                this.video.autoplay = true;
                this.video.controls = true;
            };

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendToServer(MESSAGE_TYPES.EXCHANGE, {
                        connection_id: connID,
                        type: 'candidate',
                        data: event.candidate
                    });
                }
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            this.sendToServer(MESSAGE_TYPES.FORWARD, {
                connection_id: connID,
                type: 'offer',
                data: offer.sdp
            });
        } catch (error) {
            console.error("Error in Fetch:", error);
        }
    }

    // Forward
    async ReceiveForward(data) {
        try {
            const connID = data.connection_id;
            const connection = createPeerConnection();
            this.connections[connID] = connection;

            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => connection.addTrack(track));
            }

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendToServer(MESSAGE_TYPES.EXCHANGE, {
                        connection_id: connID,
                        type: 'candidate',
                        data: event.candidate
                    });
                }
            };

            await setRemoteDescription(connection, data.sdp, 'offer');
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);

            this.sendToServer(MESSAGE_TYPES.EXCHANGE, {
                connection_id: connID,
                type: 'answer',
                data: answer.sdp
            });
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }

    async ReceiveExchange(data) {
        const connection = this.connections[data.connection_id];
        if (!connection) {
            console.error("Connection not found for ID:", data.connection_id);
            return;
        }

        try {
            if (data.data_type === 'candidate') {
                console.log("Received ICE Candidate:", data.data);
                await addIceCandidate(connection, data.data);
            } else if (data.data_type === 'answer') {
                console.log("Received Answer SDP");
                await setRemoteDescription(connection, data.data, 'answer');
            } else {
                console.warn("Unknown Exchange message type:", data.data_type);
            }
        } catch (error) {
            console.error("Error in Exchange:", error);
        }
    }
}
