const MESSAGE_TYPES = {
    ACTIVATE: 'ACTIVATE',
    PULL: 'PULL',
    PUSH: 'PUSH',
    FORWARD: 'FORWARD',
    ARRANGE: 'ARRANGE',
    FETCH: 'FETCH',
    EXCHANGE: 'EXCHANGE',
};

function generateShortUUID(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}


export default class Client {
    constructor(serverURL, userID, channelID,channelKey, video) {
        this.serverURL = serverURL;
        this.userID = userID;
        this.channelID = channelID;
        this.channelKey = channelKey;
        this.video = video;
        this.socket = null;
        this.mediaStream = null;
        this.connections = {};
    }

    async dial() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(`${this.serverURL}`);

            this.socket.onopen = () => resolve();

            this.socket.onerror = (err) => reject(`Failed to connect WebSocket: ${err.message}`);

            this.socket.onmessage = (message) => {
                const data = JSON.parse(message.data);
                switch (data.type) {
                    case MESSAGE_TYPES.ACTIVATE:
                        this.ReceiveActivate(data);
                        break;
                    case MESSAGE_TYPES.PULL:
                        this.ReceivePull(data);
                        break;
                    case MESSAGE_TYPES.PUSH:
                        this.ReceivePush(data);
                        break;
                    case MESSAGE_TYPES.FETCH:
                        this.ReceiveFetch(data);
                        break;
                    case MESSAGE_TYPES.FORWARD:
                        this.ReceiveForward(data);
                        break;
                    case MESSAGE_TYPES.EXCHANGE:
                        this.ReceiveExchange(data);
                        break;
                    default :
                        console.log("Received unknown message:", data);
                }
            };
        });
    }

    sendToServer(type, payload) {
        const request = {type : type, payload: payload};
        console.log("Sending request:", request);
        this.socket.send(JSON.stringify(request));
    }

    async SendActivate() {
        const activatePayload = {
            channel_id: this.channelID,
            channel_key: this.channelKey,
            client_id: this.userID
        };
        this.sendToServer(MESSAGE_TYPES.ACTIVATE, activatePayload);
    }

    ReceiveActivate(response) {
        console.log("Received Activate response:", response);
    }

    async SendPush(mediaStream) {
        try {
            console.log("Sending Push...")
            this.video.srcObject = mediaStream;
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
            });
            const connectionID = generateShortUUID();
            this.connections[connectionID] = connection;

            // connection.onicecandidate = (event) => {
            //     if (event.candidate) {
            //         console.log("ICE Candidate:", event.candidate);
            //         console.log(event.target)
            //     }
            // };

            mediaStream.getTracks().forEach(track => {
                connection.addTrack(track, mediaStream);
            });

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            // console.log("Generated Offer SDP:", offer.sdp);

             this.sendToServer(MESSAGE_TYPES.PUSH, { sdp: offer.sdp, connection_id: connectionID})
        } catch (error) {
            console.error("Error in Push:", error);
        }
    }

     ReceivePush(data) {
        const connection = this.connections[data.connection_id];
        if (connection) {
            connection.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp
            }));
            console.log("Push completed for connection ID:", data.connection_id)
        } else {
            console.error("Connection not found for ID:", data.connection_id);
        }
    }

    async SendPull() {
        try {
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
            });
            const connectionID = generateShortUUID();
            this.connections[connectionID] = connection;
            connection.addTransceiver('video');
            // connection.onicecandidate = (event) => {
            //     if (event.candidate) {
            //         console.log("ICE Candidate:", event.candidate);
            //     }
            // };

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
                this.mediaStream = event.streams[0];
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            console.log("Generated Offer SDP:", offer.sdp);

            await this.sendToServer(MESSAGE_TYPES.PULL, {sdp: offer.sdp,connection_id: connectionID})
            console.log("Pull sent");
        } catch (error) {
            console.error("Error in Pull:", error);
        }
    }

    ReceivePull(data) {
        const connection = this.connections[data.connection_id];
        if (connection) {
            connection.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp
            }));
            console.log("Pull completed for connection ID:", data.connection_id)
        } else {
            console.error("Connection not found for ID:", data.connection_id);
        }
    }

    async ReceiveFetch(data) {
        try {
            const connID=data.connection_id
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
            });
            this.connections[connID] = connection;

            connection.addTransceiver('video');

            connection.ontrack = (event) => {
                const fetching=new MediaStream();
                fetching.addTrack(event.track);
                this.video.srcObject = fetching;
                this.mediaStream = fetching;
                this.video.autoplay = true;
                this.video.controls = true;
            };

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("Sending ICE candidate:", event.candidate);
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

    async ReceiveForward(data) {
        try {
            const connID = data.connection_id;
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
            });
            this.connections[connID] = connection;

            this.mediaStream.getTracks().forEach(track => {
                connection.addTrack(track);
            });

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    // console.log("Sending ICE candidate:", event.candidate);
                    this.sendToServer(MESSAGE_TYPES.EXCHANGE, {
                        connection_id: connID,
                        type: 'candidate',
                        data: event.candidate
                    });
                }
            };
            // console.log("Received Offer SDP:", data.sdp);
            await connection.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: data.sdp
            }));
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            this.sendToServer(MESSAGE_TYPES.EXCHANGE, {
                connection_id: data.connection_id,
                type: 'answer',
                data: answer.sdp
            });
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }

    async ReceiveExchange(data) {
        try {
            const connection = this.connections[data.connection_id];
            if (connection) {
                switch (data.type) {
                    case 'candidate':
                        console.log("Received ICE Candidate:", data.data);
                        await connection.addIceCandidate(data.data);
                        break;
                    case 'answer':
                        console.log("Received Answer SDP:", data.sdp);
                        await connection.setRemoteDescription(new RTCSessionDescription({
                            type: 'answer',
                            sdp: data.sdp
                        }));
                        break;
                    default:
                        console.log("Unknown message type:", data.type);
                }
            } else {
                console.error("Connection not found for ID:", data.connection_id);
            }
        } catch (error) {
            console.error("Error in Exchange:", error);
        }
    }
}