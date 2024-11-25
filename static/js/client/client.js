const MESSAGE_TYPES = {
    PULL: 'PULL',
    PUSH: 'PUSH',
    FORWARD: 'FORWARD',
    ARRANGE: 'ARRANGE',
    FETCH: 'FETCH'
};

export default class Client {
    constructor(serverURL, userID, channelID, video) {
        this.serverURL = serverURL;
        this.userID = userID;
        this.channelID = channelID;
        this.video = video;
        this.socket = null;
        this.requestId = 0;
        this.pendingRequests = {};
        this.mediaStream = null;
    }

    async dial() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(`ws://${this.serverURL}/ws`);

            this.socket.onopen = () => resolve();

            this.socket.onerror = (err) => reject(`Failed to connect WebSocket: ${err.message}`);

            this.socket.onmessage = (message) => {
                const data = JSON.parse(message.data);
                const requestId = data.request_id;

                if (requestId && this.pendingRequests[requestId]) {
                    this.pendingRequests[requestId](data);
                    delete this.pendingRequests[requestId];
                }
            };
        });
    }

    send(data) {
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestId;
            data.request_id = requestId;

            this.pendingRequests[requestId] = resolve;
            this.socket.send(JSON.stringify(data));
        });
    }

    async activate() {
        const activatePayload = {
            channel_id: this.channelID,
            user_id: this.userID
        };
        await this.send(activatePayload).then(console.log);
    }

    async Push(mediaStream) {
        try {
            this.video.srcObject = mediaStream;
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("ICE Candidate:", event.candidate);
                }
            };

            mediaStream.getTracks().forEach(track => {
                connection.addTrack(track, mediaStream);
            });

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            console.log("Generated Offer SDP:", offer.sdp);

            await this.send({
                type: MESSAGE_TYPES.PUSH,
                sdp: offer.sdp
            }).then(async (response) => {
                console.log("Response:", response);
                await connection.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: response.sdp
                }));
            })
            console.log("Push completed");
        } catch (error) {
            console.error("Error in Push:", error);
        }
    }

    async Pull() {
        try {
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            connection.addTransceiver('video');

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    const offer =  connection.createOffer();
                }
            };

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            console.log("Generated Offer SDP:", offer.sdp);

            await this.send({
                Type: MESSAGE_TYPES.PULL,
                sdp: offer.sdp
            }).then(async (response) => {
                await connection.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: response.sdp
                }));
            })
        } catch (error) {
            console.error("Error in Pull:", error);
        }
    }

    async Fetch() {
        try {
            const connection = new RTCPeerConnection();

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            const response = await this.send({
                Type: MESSAGE_TYPES.FETCH,
                SDP: offer.sdp
            });

            await connection.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: response.SDP
            }));

            console.log("Fetch completed.");
        } catch (error) {
            console.error("Error in Fetch:", error);
        }
    }

    async Forward() {
        try {
            // Pull the stream from the server to consume and watch
            const connection = new RTCPeerConnection();

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
                // Store the mediaStream for forwarding
                this.mediaStream = event.streams[0];
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            const response = await this.send({
                Type: MESSAGE_TYPES.FORWARD,
                SDP: offer.sdp
            });

            await connection.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: response.SDP
            }));

            // Set up handler for 'ARRANGE' messages from the server
            this.messageHandlers[MESSAGE_TYPES.ARRANGE] = (data) => {
                this.Arrange(data.SDP, data.FetcherID);
            };

            console.log("Forwarder is set up and watching the stream.");
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }

    async Arrange(offerSDP, fetcherID) {
        try {
            // Create a new connection to the fetcher
            const connection = new RTCPeerConnection();

            // Add tracks from the mediaStream to the new connection
            this.mediaStream.getTracks().forEach(track => {
                connection.addTrack(track, this.mediaStream);
            });

            await connection.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: offerSDP
            }));

            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);

            // Send the answer back to the server to forward to the fetcher
            await this.send({
                Type: MESSAGE_TYPES.ARRANGE,
                SDP: answer.sdp,
                FetcherID: fetcherID
            });

            console.log("Arranged connection with fetcher.");
        } catch (error) {
            console.error("Error in Arrange:", error);
        }
    }
}
