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
    handleServerMessage(response) {
        switch (response.type) {
            case MESSAGE_TYPES.ACTIVATE:
                this.ReceiveActivate(response);
                break;
            case MESSAGE_TYPES.SIGNAL:
                this.ReceiveSignal(response);
                break;
            case MESSAGE_TYPES.FORWARD:
                this.ReceiveForward(response);
                break;
            case MESSAGE_TYPES.FORWARDING:
                this.ReceiveForwarding(response);
                break;
            case MESSAGE_TYPES.CLEAR:
                this.ReceiveClear(response);
                break;
            case MESSAGE_TYPES.CLOSED:
                this.ReceiveClosed(response);
                break;
            default:
                console.warn("Received unknown message type:", response);
        }
    }

    // Generic send
    sendToServer(type, payload) {
        const request = { type, payload };
        console.log("Sending request:", request.type);
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
        console.log("Received Activate response:", response.type);
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

            console.log("Generated Offer SDP for Pull:");
            await this.sendToServer(MESSAGE_TYPES.PULL, { sdp: offer.sdp, connection_id: connectionID });
            console.log("Pull sent");
        } catch (error) {
            console.error("Error in Pull:", error);
        }
    }

    // Fetch
    async ReceiveForward(data) {
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
                    this.sendToServer(MESSAGE_TYPES.SIGNAL, {
                        connection_id: connID,
                        signal_type: 'candidate',
                        signal_data: JSON.stringify(event.candidate),
                    });
                }
            };

            connection.oniceconnectionstatechange = (event) => {
                console.log("ICE Connection State:", event.target.iceConnectionState);
                switch (event.target.iceConnectionState) {
                    case "connected":
                        console.log("ICE connection is in the completed state.");
                        this.sendToServer(MESSAGE_TYPES.FORWARDED, { connection_id: connID })
                        break;
                    case "failed":
                        console.error("ICE connection failed. Connection may need to be restarted.");
                        this.sendToServer(MESSAGE_TYPES.FAILED, { connection_id: connID })
                        break;
                    case "disconnected":
                    case "closed":
                        console.log("ICE connection has been closed.");
                        this.sendToServer(MESSAGE_TYPES.DISCONNECTED, { connection_id: connID })
                        break;
                }
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            this.sendToServer(MESSAGE_TYPES.FORWARDING, {
                connection_id: connID,
                sdp: offer.sdp
            });
        } catch (error) {
            console.error("Error in Fetch:", error);
        }
    }

    // Forward
    async ReceiveForwarding(data) {
        try {
            const connID = data.connection_id;
            const connection = createPeerConnection();
            this.connections[connID] = connection;

            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => connection.addTrack(track));
            }

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendToServer(MESSAGE_TYPES.SIGNAL, {
                        connection_id: connID,
                        signal_type: 'candidate',
                        signal_data: JSON.stringify(event.candidate)
                    });
                }
            };

            connection.oniceconnectionstatechange = (event) => {
                console.log("ICE Connection State:", event.target.iceConnectionState);
                switch (event.target.iceConnectionState) {
                    case "failed":
                        console.error("ICE connection failed. Connection may need to be restarted.");
                        this.sendToServer(MESSAGE_TYPES.FAILED, { connection_id: connID })
                        break;
                    case "disconnected":
                    case "closed":
                        console.log("ICE connection has been closed.");
                        this.sendToServer(MESSAGE_TYPES.DISCONNECTED, { connection_id: connID })
                        break;
                }
            };

            await setRemoteDescription(connection, data.sdp, 'offer');
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);

            this.sendToServer(MESSAGE_TYPES.SIGNAL, {
                connection_id: connID,
                signal_type: 'answer',
                signal_data: answer.sdp
            });
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }

    async ReceiveSignal(data) {
        const connection = this.connections[data.connection_id];
        if (!connection) {
            console.error("Connection not found for ID:", data.connection_id);
            return;
        }

        try {
            if (data.signal_type === 'candidate') {
                console.log("Received ICE Candidate:", data.signal_data);
                await addIceCandidate(connection, JSON.parse(data.signal_data));
            } else if (data.signal_type === 'answer') {
                console.log("Received Answer SDP");
                await setRemoteDescription(connection, data.signal_data, 'answer');
            } else {
                console.warn("Unknown Exchange message type:", data.signal_type);
            }
        } catch (error) {
            console.error("Error in Signaling:", error);
        }
    }

    async ReceiveClear(data) {
        try{
            const connection = this.connections[data.connection_id];
            if (connection) {
                connection.close();
                delete this.connections[data.connection_id];
            }
        } catch (error) {
            console.error("Error in Close:", error);
        }
    }

    async ReceiveClosed(data) {
        try{
            const connection = this.connections[data.connection_id];
            if (connection) {
                connection.close();
                delete this.connections[data.connection_id];
            }
            this.SendPull();
        } catch (error) {
            console.error("Error in Close:", error);
        }
    }
}
