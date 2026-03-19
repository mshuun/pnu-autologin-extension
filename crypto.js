// ArrayBuffer <-> Base64 변환 유틸리티
function bufferToBase64(buf) {
    const uint8 = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// AES-GCM 키 생성 및 내보내기 (저장용)
async function generateAndExportKey() {
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exportedKey = await crypto.subtle.exportKey("jwk", key);
    return exportedKey;
}

// JWK 키 불러오기
async function importKey(jwk) {
    return await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

// 텍스트 암호화
async function encryptText(text, jwkKey) {
    const key = await importKey(jwkKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoded
    );
    
    return {
        ciphertext: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv)
    };
}

// 텍스트 복호화
async function decryptText(encryptedObj, jwkKey) {
    const key = await importKey(jwkKey);
    const ciphertextBuffer = base64ToBuffer(encryptedObj.ciphertext);
    const ivBuffer = base64ToBuffer(encryptedObj.iv);
    
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
        key,
        ciphertextBuffer
    );
    
    return new TextDecoder().decode(decrypted);
}