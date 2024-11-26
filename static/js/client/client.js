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
        this.messageHandlers = {};
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
                } else {
                    const type = data.type;
                    if (this.messageHandlers[type]) {
                        this.messageHandlers[type](data);
                    } else {
                        console.warn("Unhandled message type:", type);
                    }
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
                    console.log("ICE Candidate:", event.candidate);
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
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            connection.addTransceiver('video');

            // ICE Gathering 완료 플래그
            let isIceGatheringComplete = false;

            connection.onicecandidate = (event) => {
                if (!event.candidate) {
                    // ICE Gathering이 완료되면 SDP를 전송
                    console.log("ICE Gathering Complete");
                    isIceGatheringComplete = true;

                    // ICE가 포함된 SDP 전송
                    sendSDPWithICE();
                }
            };

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
            };

            // Offer 생성 및 설정
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            console.log("Local SDP created, waiting for ICE candidates...");

            // SDP와 ICE를 포함한 메시지를 전송
            const sendSDPWithICE = async () => {
                if (!isIceGatheringComplete) return;

                console.log("Sending SDP with ICE Candidates...");
                console.log("Final SDP with ICE:", connection.localDescription.sdp);

                await this.send({
                    Type: MESSAGE_TYPES.FETCH,
                    sdp: connection.localDescription.sdp // ICE 정보가 포함된 SDP
                }).then(async (response) => {
                    console.log("Received Answer SDP:", response.sdp);
                    await connection.setRemoteDescription(
                        new RTCSessionDescription({
                            type: 'answer',
                            sdp: response.sdp
                        })
                    );
                });
            };
        } catch (error) {
            console.error("Error in Fetch:", error);
        }
    }

    async Forward() {
        try {
            // Pull the stream from the server to consume and watch
            const connection = new RTCPeerConnection();
            connection.addTransceiver('video');
            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("ICE Candidate:", event.candidate);
                }
            };

            connection.ontrack = (event) => {
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
                // Store the mediaStream for forwarding
                this.mediaStream = event.streams[0];
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            await this.send({
                Type: MESSAGE_TYPES.FORWARD,
                sdp: offer.sdp
            }).then(async (response) => {
                await connection.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: response.sdp
                }));
            })

            // Set up handler for 'ARRANGE' messages from the server
            this.messageHandlers[MESSAGE_TYPES.ARRANGE] = (data) => {
                this.Arrange(data.sdp);
            };

            console.log("Forwarder is set up and watching the stream.");
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }

    async Arrange(offerSDP) {
        try {
            // Create a new connection to the fetcher
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            // Add tracks from the mediaStream to the new connection
            this.mediaStream.getTracks().forEach(track => {
                connection.addTrack(track);
            });

            let isIceGatheringComplete = false;

            // Listen for ICE candidates
            connection.onicecandidate = (event) => {
                if (!event.candidate) {
                    // ICE Gathering 완료
                    console.log("ICE Gathering Complete");
                    isIceGatheringComplete = true;

                    // ICE 정보가 포함된 SDP 전송
                    sendSDPWithICE();
                } else {
                    console.log("ICE Candidate:", event.candidate);
                }
            };

            // Set remote SDP from offer
            await connection.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: offerSDP
            }));

            // Create answer SDP
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);

            console.log("Local SDP created, waiting for ICE candidates...");

            // ICE Gathering 완료 후 SDP 전송
            const sendSDPWithICE = async () => {
                if (!isIceGatheringComplete) return;

                console.log("Sending Answer SDP with ICE Candidates...");
                console.log("Final Answer SDP with ICE:", connection.localDescription.sdp);

                await this.send({
                    type: MESSAGE_TYPES.ARRANGE,
                    sdp: connection.localDescription.sdp, // ICE 정보 포함
                    user_id: this.userID,
                });

                console.log("Sent Answer SDP:", connection.localDescription.sdp);
                console.log("Arranged connection with fetcher.");
            };
        } catch (error) {
            console.error("Error in Arrange:", error);
        }
    }
}
