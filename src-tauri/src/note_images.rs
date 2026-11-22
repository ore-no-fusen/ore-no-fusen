use crate::state::AppState;
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::http::{header, Response, StatusCode};

pub(crate) fn authorized_path(state: &Mutex<AppState>, path: &Path) -> Result<PathBuf, String> {
    let denied = || "付箋の画像フォルダー外のファイルは読み込めません。".to_string();
    if !path.is_absolute() {
        return Err(denied());
    }
    let path = dunce::canonicalize(path).map_err(|_| denied())?;
    if !path.is_file() {
        return Err(denied());
    }
    let base = {
        let state = state.lock().map_err(|e| e.to_string())?;
        if state.approved_external_images.contains(&path) {
            return Ok(path);
        }
        state.base_path.clone()
    };
    if let Some(root) = base.and_then(|root| dunce::canonicalize(root).ok()) {
        let relative = path.strip_prefix(root).map_err(|_| denied())?;
        let parts: Vec<_> = relative.components().collect();
        let normal = |index| match parts.get(index) {
            Some(Component::Normal(name)) => name.to_str(),
            _ => None,
        };
        let asset_index = match normal(0) {
            Some(name) if name.eq_ignore_ascii_case("tags") => 2,
            Some(name)
                if name.eq_ignore_ascii_case("Archive") || name.eq_ignore_ascii_case("Trash") =>
            {
                1
            }
            _ => 0,
        };
        if parts.len() > asset_index + 1
            && normal(asset_index).is_some_and(|name| name.eq_ignore_ascii_case("assets"))
        {
            return Ok(path);
        }
    }
    Err(denied())
}

fn mime(bytes: &[u8]) -> Option<&'static str> {
    match image::guess_format(bytes).ok()? {
        image::ImageFormat::Png => Some("image/png"),
        image::ImageFormat::Jpeg => Some("image/jpeg"),
        image::ImageFormat::Gif => Some("image/gif"),
        image::ImageFormat::WebP => Some("image/webp"),
        image::ImageFormat::Bmp => Some("image/bmp"),
        image::ImageFormat::Ico => Some("image/x-icon"),
        image::ImageFormat::Avif => Some("image/avif"),
        _ => None,
    }
}

pub(crate) fn read_image(path: &Path) -> Option<(&'static str, Vec<u8>)> {
    let mut file = fs::File::open(path).ok()?;
    let mut bytes = Vec::new();
    (&mut file).take(64).read_to_end(&mut bytes).ok()?;
    let mime = mime(&bytes)?;
    file.read_to_end(&mut bytes).ok()?;
    Some((mime, bytes))
}

pub(crate) fn response(state: &Mutex<AppState>, encoded_path: &str) -> Response<Vec<u8>> {
    // convertFileSrc supplies one encodeURIComponent-encoded path as the first segment.
    let path = encoded_path.strip_prefix('/').unwrap_or(encoded_path);
    let decoded = url::form_urlencoded::parse(path.as_bytes()).next();
    let image = decoded.and_then(|(path, _)| {
        let path = authorized_path(state, Path::new(path.as_ref())).ok()?;
        read_image(&path)
    });
    let response = Response::builder().header(header::CACHE_CONTROL, "no-store");
    match image {
        Some((mime, bytes)) => response
            .header(header::CONTENT_TYPE, mime)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .body(bytes),
        None => response.status(StatusCode::NOT_FOUND).body(Vec::new()),
    }
    .expect("valid note image response")
}

#[tauri::command]
pub(crate) async fn fusen_approve_external_image(
    state: tauri::State<'_, Mutex<AppState>>,
    path: String,
) -> Result<bool, String> {
    let requested = Path::new(&path);
    if !requested.is_absolute() {
        return Ok(false);
    }
    let requested = dunce::canonicalize(requested).map_err(|e| e.to_string())?;
    let Some(selected) = rfd::AsyncFileDialog::new()
        .set_title("付箋に表示する画像ファイルを選択")
        .add_filter(
            "画像",
            &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"],
        )
        .pick_file()
        .await
    else {
        return Ok(false);
    };
    let selected = dunce::canonicalize(selected.path()).map_err(|e| e.to_string())?;
    if selected != requested || !selected.is_file() {
        return Ok(false);
    }
    if read_image(&selected).is_none() {
        return Ok(false);
    }
    crate::storage::update_settings(|settings| {
        settings.approved_external_images.insert(selected.clone());
        Ok(())
    })?;
    state
        .lock()
        .map_err(|e| e.to_string())?
        .approved_external_images
        .insert(selected);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_limits_reads_to_managed_assets_and_selected_external_images() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("カスタム保存先");
        let managed = root
            .join("tags")
            .join("仕事")
            .join("assets")
            .join("imported");
        fs::create_dir_all(&managed).unwrap();
        let png = b"\x89PNG\r\n\x1a\n";
        let note_image = managed.join("画像 & +.png");
        let text = managed.join("note.txt");
        let external = temp.path().join("external.png");
        fs::write(&note_image, png).unwrap();
        fs::write(&text, b"this is a text file").unwrap();
        fs::write(&external, png).unwrap();
        let state = Mutex::new(AppState {
            base_path: Some(root.to_string_lossy().into_owned()),
            folder_path: Some(temp.path().to_string_lossy().into_owned()),
            ..Default::default()
        });
        let request = |path: &Path| {
            let encoded: String =
                url::form_urlencoded::byte_serialize(path.to_str().unwrap().as_bytes()).collect();
            response(&state, &encoded)
        };
        let result = request(&note_image);
        assert_eq!(result.status(), StatusCode::OK);
        assert_eq!(result.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(result.body().as_slice(), png);
        assert_eq!(request(&text).status(), StatusCode::NOT_FOUND);
        assert_eq!(request(&external).status(), StatusCode::NOT_FOUND);
        state
            .lock()
            .unwrap()
            .approved_external_images
            .insert(dunce::canonicalize(&external).unwrap());
        assert_eq!(request(&external).status(), StatusCode::OK);
        state.lock().unwrap().base_path = None;
        assert_eq!(request(&note_image).status(), StatusCode::NOT_FOUND);
    }
}
