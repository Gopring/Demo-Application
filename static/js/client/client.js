const MESSAGE_TYPES = {
    ACTIVATE: 'ACTIVATE',
    PULL: 'PULL',
    PUSH: 'PUSH',
    FORWARD: 'FORWARD',
    ARRANGE: 'ARRANGE',
    FETCH: 'FETCH'
};

class Message {
    static requestId = 0; // 전역적으로 증가하는 Request ID

    static create(type, payload = {}) {
        return {
            request_id: ++this.requestId,
            type: type,
            payload: payload,
        };
    }
}

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
            this.socket = new WebSocket(`${this.serverURL}`);

            this.socket.onopen = async () => {
                try {
                    await this.activate();
                    resolve();
                } catch (err) {
                    reject(`Failed to activate WebSocket: ${err.message}`);
                }
            };

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

    send(type, payload) {
        return new Promise((resolve, reject) => {
            const message = Message.create(type, payload);
    
            console.log("Sending request:", JSON.stringify(message));
            this.pendingRequests[message.request_id] = resolve;
    
            try {
                this.socket.send(JSON.stringify(message));
            } catch (err) {
                console.error("Failed to send request:", err);
                reject(err);
            }
        });
    }


    async activate() {
        const payload = {
            channel_id: this.channelID,
            user_id: this.userID
        };
        await this.send(MESSAGE_TYPES.ACTIVATE, payload).then(console.log);
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
                    console.log(event.target)
                }
            };

            mediaStream.getTracks().forEach(track => {
                connection.addTrack(track, mediaStream);
            });

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            console.log("Generated Offer SDP:", offer.sdp);

            await this.send(MESSAGE_TYPES.PUSH,{sdp : offer.sdp}).then(async (response) => {
                console.log("Server SDP Answer:", response.sdp); 
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
            console.log("Pull: Initializing PeerConnection...");
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            console.log("Pull: Adding Transceiver...");
            connection.addTransceiver('video');
            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("Pull: ICE Candidate:", event.candidate);
                }else {
                    console.log("Pull: ICE Candidate gathering complete.");
                }
            };

            connection.ontrack = (event) => {
                console.log("Pull: Received track event:", event);
                console.log("Pull: Attaching track to video element...");
                this.video.srcObject = event.streams[0];
                this.video.autoplay = true;
                this.video.controls = true;
            };

            console.log("Pull: Creating SDP Offer...");
            const offer = await connection.createOffer();
            console.log("Pull: Setting local description with Offer SDP...");
            await connection.setLocalDescription(offer);
            console.log("Pull: Generated Offer SDP:", offer.sdp);

            console.log("Pull: Sending Offer SDP to server...");
            await this.send(MESSAGE_TYPES.PULL,{sdp : offer.sdp}).then(async (response) => {
                console.log("Pull: Received Answer SDP from server...", response.sdp);
                await connection.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: response.sdp
                }));
                console.log("Pull: Answer SDP successfully set.");
            });
            console.log("Pull: Pull operation completed successfully.");
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
            connection.ontrack = (event) => {
                console.log("Received track event:", event);

                // 기존의 streams 배열 대신 개별 트랙 사용
                const track = event.track;

                // 기존에 사용할 MediaStream이 없으면 새로 생성
                if (!this.mediaStream) {
                    this.mediaStream = new MediaStream(); // MediaStream 객체 생성
                }
                // MediaStream에 트랙 추가
                this.mediaStream.addTrack(track);
                // Video Element에 MediaStream 설정
                this.video.srcObject = this.mediaStream;
                this.video.autoplay = true;
                this.video.controls = true;
                console.log("MediaStream updated with track:", this.mediaStream);
            };

            connection.onicecandidate = (event) => {
                if (!event.candidate) {
                    // ICE Gathering이 완료되면 SDP를 전송
                    console.log("ICE Gathering Complete");
                    isIceGatheringComplete = true;

                    // ICE가 포함된 SDP 전송
                    sendSDPWithICE();
                }
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
