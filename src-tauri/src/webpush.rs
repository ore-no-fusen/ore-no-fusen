/*
 * Web Push モジュール (RFC 8291 / RFC 8292)
 *
 * 責務:
 * - VAPID 鍵ペアの生成・保存・読み込み
 * - RFC 8292 VAPID JWT 署名
 * - RFC 8291 AES-128-GCM ペイロード暗号化
 * - APNs HTTP/2 POST 送信
 */

use std::path::PathBuf;
use reqwest::Client;
use p256::ecdh::EphemeralSecret;
use p256::{PublicKey, EncodedPoint};
use p256::ecdsa::SigningKey;
use p256::pkcs8::EncodePrivateKey;
use aes_gcm::Aes128Gcm;
use aes_gcm::aead::{Aead, KeyInit};
use hkdf::Hkdf;
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use directories::BaseDirs;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use crate::state::ProConfig;

// ------ 型定義 ------

#[derive(Serialize, Deserialize, Clone)]
pub struct VapidKeys {
    pub public_key_b64url: String,
    pub private_key_b64url: String,
    pub subject: String,
}

#[derive(Serialize, Deserialize)]
struct VapidClaims {
    aud: String,
    exp: u64,
    sub: String,
}

// ------ パス ------

pub fn get_vapid_key_path() -> PathBuf {
    if let Some(base_dirs) = BaseDirs::new() {
        base_dirs.data_local_dir()
            .join("ore-no-fusen")
            .join("push_keys.json")
    } else {
        PathBuf::from("ore-no-fusen/push_keys.json")
    }
}

// ------ 鍵生成・ロード ------

pub fn generate_vapid_keys() -> Result<VapidKeys, String> {
    let signing_key = SigningKey::random(&mut rand_core::OsRng);
    let verifying_key = signing_key.verifying_key();
    let public_point = verifying_key.to_encoded_point(false);
    let public_bytes = public_point.as_bytes();
    let private_bytes = signing_key.to_bytes();

    let keys = VapidKeys {
        public_key_b64url: URL_SAFE_NO_PAD.encode(public_bytes),
        private_key_b64url: URL_SAFE_NO_PAD.encode(&private_bytes[..]),
        subject: "mailto:ore-no-fusen@example.com".to_string(),
    };

    let path = get_vapid_key_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(keys)
}

pub fn load_or_generate_vapid_keys() -> Result<VapidKeys, String> {
    let path = get_vapid_key_path();
    if path.exists() {
        let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return serde_json::from_str(&json).map_err(|e| e.to_string());
    }

    // フォールバック: 旧ファイル名 vapid_keys.json から読み込み
    let old_path = if let Some(base_dirs) = BaseDirs::new() {
        base_dirs.data_local_dir()
            .join("ore-no-fusen")
            .join("vapid_keys.json")
    } else {
        PathBuf::from("ore-no-fusen/vapid_keys.json")
    };

    if old_path.exists() {
        let json = std::fs::read_to_string(&old_path).map_err(|e| e.to_string())?;
        let keys: VapidKeys = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        // 新しいパスに保存（以降は新しい名前で読み込まれる）
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
        let _ = std::fs::write(&path, json);
        return Ok(keys);
    }

    // どちらも存在しない場合は新規生成
    generate_vapid_keys()
}

// ------ JWT 署名 (RFC 8292 VAPID) ------

pub fn sign_vapid_jwt(endpoint: &str, keys: &VapidKeys) -> Result<String, String> {
    // endpoint の origin を抽出 ("https://api.push.apple.com")
    let origin = extract_origin(endpoint)?;

    let exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs()
        + 12 * 3600;

    let claims = VapidClaims {
        aud: origin,
        exp,
        sub: keys.subject.clone(),
    };

    let private_key_bytes = URL_SAFE_NO_PAD.decode(&keys.private_key_b64url)
        .map_err(|e| e.to_string())?;

    // jsonwebtoken 9: EncodingKey::from_ec_der expects SEC1 DER-encoded key
    // p256 SigningKey から SEC1 DER を生成する
    let signing_key = SigningKey::from_bytes(private_key_bytes.as_slice().into())
        .map_err(|e| e.to_string())?;
    let pkcs8_der = signing_key.to_pkcs8_der()
        .map_err(|e: p256::pkcs8::Error| e.to_string())?;

    let encoding_key = EncodingKey::from_ec_der(pkcs8_der.as_bytes());
    let header = Header::new(Algorithm::ES256);

    encode(&header, &claims, &encoding_key).map_err(|e| e.to_string())
}

fn extract_origin(endpoint: &str) -> Result<String, String> {
    // "https://api.push.apple.com/3/device/TOKEN" -> "https://api.push.apple.com"
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    let origin = format!(
        "{}://{}",
        url.scheme(),
        url.host_str().ok_or("no host in endpoint")?
    );
    Ok(origin)
}

// ------ AES-128-GCM 暗号化 (RFC 8291) ------

pub fn encrypt_payload(
    p256dh_b64url: &str,
    auth_b64url: &str,
    plaintext: &[u8],
) -> Result<Vec<u8>, String> {
    // 1. 受信側公開鍵をデコード
    let peer_pub_bytes = URL_SAFE_NO_PAD.decode(p256dh_b64url)
        .map_err(|e| format!("p256dh decode error: {e}"))?;
    let peer_pub_key = PublicKey::from_sec1_bytes(&peer_pub_bytes)
        .map_err(|e| format!("peer public key parse error: {e}"))?;

    // 2. 送信側エフェメラル鍵ペア生成
    let ephemeral_secret = EphemeralSecret::random(&mut rand_core::OsRng);
    let ephemeral_pub = EncodedPoint::from(ephemeral_secret.public_key());
    let ephemeral_pub_bytes = ephemeral_pub.as_bytes(); // 65 bytes uncompressed

    // 3. ECDH 共有シークレット
    let shared_secret = ephemeral_secret.diffie_hellman(&peer_pub_key);
    let shared_secret_bytes = shared_secret.raw_secret_bytes();

    // 4. auth secret デコード
    let auth_bytes = URL_SAFE_NO_PAD.decode(auth_b64url)
        .map_err(|e| format!("auth decode error: {e}"))?;

    // 5. salt = 16 random bytes
    let mut salt = [0u8; 16];
    use rand_core::RngCore;
    rand_core::OsRng.fill_bytes(&mut salt);

    // 6. RFC 8291 HKDF 鍵導出
    // PRK_key = HKDF-SHA256(salt=auth_secret, IKM=shared_secret,
    //            info="WebPush: info\x00" || peer_pub || ephemeral_pub)
    let mut info_key = b"WebPush: info\x00".to_vec();
    info_key.extend_from_slice(&peer_pub_bytes);
    info_key.extend_from_slice(ephemeral_pub_bytes);

    let hk_key = Hkdf::<Sha256>::new(Some(&auth_bytes), &shared_secret_bytes[..]);
    let mut prk_key = [0u8; 32];
    hk_key.expand(&info_key, &mut prk_key)
        .map_err(|_| "HKDF expand (key) failed".to_string())?;

    // CEK = HKDF-SHA256(salt=salt, IKM=PRK_key, info="Content-Encoding: aes128gcm\x00")
    let hk_cek = Hkdf::<Sha256>::new(Some(&salt), &prk_key);
    let mut cek = [0u8; 16];
    hk_cek.expand(b"Content-Encoding: aes128gcm\x00", &mut cek)
        .map_err(|_| "HKDF expand (CEK) failed".to_string())?;

    // Nonce = HKDF-SHA256(salt=salt, IKM=PRK_key, info="Content-Encoding: nonce\x00")[..12]
    let mut nonce_bytes = [0u8; 12];
    hk_cek.expand(b"Content-Encoding: nonce\x00", &mut nonce_bytes)
        .map_err(|_| "HKDF expand (nonce) failed".to_string())?;

    // 7. AES-128-GCM 暗号化
    let cipher = Aes128Gcm::new_from_slice(&cek)
        .map_err(|e| format!("AES-GCM key error: {e}"))?;

    // padding: plaintext + \x02 (delimiter)
    let mut padded = plaintext.to_vec();
    padded.push(0x02); // RFC 8291 delimiter byte

    let ciphertext = cipher.encrypt((&nonce_bytes).into(), padded.as_slice())
        .map_err(|e| format!("AES-GCM encrypt error: {e}"))?;

    // 8. RFC 8291 ヘッダー構築:
    //    salt (16) || record_size (4, big-endian) || key_id_len (1) || key_id (65) || ciphertext
    let record_size: u32 = (ciphertext.len() + 1) as u32; // approximate
    let mut output = Vec::new();
    output.extend_from_slice(&salt);
    output.extend_from_slice(&record_size.to_be_bytes());
    output.push(ephemeral_pub_bytes.len() as u8); // key_id_len = 65
    output.extend_from_slice(ephemeral_pub_bytes);
    output.extend_from_slice(&ciphertext);

    Ok(output)
}

// ------ APNs 送信 ------

pub async fn send_web_push(
    client: &Client,
    pro_config: &ProConfig,
    plaintext_json: &str,
) -> Result<(), String> {
    let keys = load_or_generate_vapid_keys()?;
    let encrypted = encrypt_payload(&pro_config.p256dh, &pro_config.auth, plaintext_json.as_bytes())?;
    let jwt = sign_vapid_jwt(&pro_config.push_endpoint, &keys)?;

    let authorization = format!("vapid t={},k={}", jwt, keys.public_key_b64url);

    let response = client
        .post(&pro_config.push_endpoint)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Encoding", "aes128gcm")
        .header("TTL", "86400")
        .header("Authorization", authorization)
        .body(encrypted)
        .send()
        .await
        .map_err(|e| format!("reqwest error: {e}"))?;

    let status = response.status();
    if status.as_u16() != 201 {
        return Err(format!("APNs error: {status}"));
    }

    Ok(())
}

// ------ Tests ------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vapid_key_path_returns_ore_no_fusen_dir() {
        let path = get_vapid_key_path();
        assert!(path.to_string_lossy().contains("ore-no-fusen"));
        assert!(path.to_string_lossy().ends_with("push_keys.json"));
    }

    #[test]
    fn test_generate_vapid_keys_creates_valid_keypair() {
        let keys = generate_vapid_keys().unwrap();
        let pub_bytes = URL_SAFE_NO_PAD.decode(&keys.public_key_b64url).unwrap();
        let priv_bytes = URL_SAFE_NO_PAD.decode(&keys.private_key_b64url).unwrap();
        assert_eq!(pub_bytes.len(), 65, "Public key must be 65 bytes (uncompressed P-256)");
        assert_eq!(priv_bytes.len(), 32, "Private key must be 32 bytes");
    }

    #[test]
    fn test_sign_vapid_jwt_returns_non_empty() {
        let keys = generate_vapid_keys().unwrap();
        let jwt = sign_vapid_jwt("https://api.push.apple.com/3/device/test", &keys).unwrap();
        assert!(!jwt.is_empty());
        // JWT は 3 つのドット区切りセクションを持つ
        assert_eq!(jwt.split('.').count(), 3);
    }

    #[test]
    fn test_encrypt_payload_returns_non_empty_bytes() {
        // テスト用のダミー P-256 鍵を生成して使用
        let keys = generate_vapid_keys().unwrap();
        // p256dh には有効な 65-byte 公開鍵（uncompressed）が必要
        let pub_bytes = URL_SAFE_NO_PAD.decode(&keys.public_key_b64url).unwrap();
        let p256dh = URL_SAFE_NO_PAD.encode(&pub_bytes);
        // auth は 16 random bytes
        let auth_bytes = vec![0u8; 16];
        let auth = URL_SAFE_NO_PAD.encode(&auth_bytes);
        let result = encrypt_payload(&p256dh, &auth, b"hello world");
        assert!(result.is_ok(), "encrypt_payload failed: {:?}", result.err());
        assert!(!result.unwrap().is_empty());
    }
}
