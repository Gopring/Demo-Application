// WebRTC related helper functions to reduce duplication in Client

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Create and return a pre-configured RTCPeerConnection instance
 */
export function createPeerConnection() {
    return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

/**
 * Set the remote description on the RTCPeerConnection
 * @param {RTCPeerConnection} connection
 * @param {string} sdp
 * @param {string} type - 'offer' or 'answer'
 */
export async function setRemoteDescription(connection, sdp, type) {
    const desc = new RTCSessionDescription({ type, sdp });
    await connection.setRemoteDescription(desc);
}

/**
 * Add ICE candidate to the given connection
 * @param {RTCPeerConnection} connection
 * @param {RTCIceCandidateInit} candidate
 */
export async function addIceCandidate(connection, candidate) {
    await connection.addIceCandidate(candidate);
}
