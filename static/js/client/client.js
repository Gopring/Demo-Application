const MESSAGE_TYPES = {
    ACTIVATE: 'ACTIVATE',
    PULL: 'PULL',
    PUSH: 'PUSH',
    FORWARD: 'FORWARD',
    ARRANGE: 'ARRANGE',
    FETCH: 'FETCH'
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
        this.controller=(message) => {
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
                default :
                    console.log("Received unknown message:", data);
            }
        }
    }

    async dial() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(`${this.serverURL}`);

            this.socket.onopen = () => resolve();

            this.socket.onerror = (err) => reject(`Failed to connect WebSocket: ${err.message}`);

            this.socket.onmessage = this.controller;
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

    async Fetch() {
        try {
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
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

                await this.sendToServer({
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
            // Create a new connection to the fetcher
            const connection = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
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

                await this.sendToServer({
                    type: MESSAGE_TYPES.ARRANGE,
                    sdp: connection.localDescription.sdp, // ICE 정보 포함
                    user_id: this.userID,
                });

                console.log("Sent Answer SDP:", connection.localDescription.sdp);
                console.log("Arranged connection with fetcher.");
            };
        } catch (error) {
            console.error("Error in Forward:", error);
        }
    }
}