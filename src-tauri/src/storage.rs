
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use crate::state::{Note, NoteMeta};
use crate::logic;

pub fn list_notes(folder_path: &str) -> Vec<NoteMeta> {
    let mut notes = Vec::new();
    let walker = WalkDir::new(folder_path).max_depth(1).into_iter();

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let (seq, updated, context) = logic::parse_filename(&filename);
                
                let mut x = None;
                let mut y = None;
                let mut width = None;
                let mut height = None;
                let mut background_color = None;
                let mut always_on_top = None;

                if let Ok(content) = fs::read_to_string(path) {
                     let (lx, ly, lw, lh, lc, laot) = logic::extract_meta_from_content(&content);
                     x = lx; y = ly; width = lw; height = lh; background_color = lc; always_on_top = laot;
                }

                notes.push(NoteMeta {
                    path: path.to_string_lossy().to_string(),
                    seq,
                    context,
                    updated,
                    x, y, width, height, background_color, always_on_top
                });
            }
        }
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
}

pub fn read_note(path: &str) -> Result<Note, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    
    Ok(Note {
        body: content,
        frontmatter: String::new(),
        meta: NoteMeta { path: path.to_string(), ..Default::default() },
    })
}

pub fn write_note(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn rename_note(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

pub fn get_next_seq(folder_path: &str) -> i32 {
    let dir = Path::new(folder_path);
    let mut max_seq = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            let (seq, _, _) = logic::parse_filename(&name);
            if seq > max_seq { max_seq = seq; }
        }
    }
    max_seq + 1
}

pub fn ensure_trash_dir(parent_path: &Path) -> Result<PathBuf, String> {
    let trash_dir = parent_path.join("Trash");
    if !trash_dir.exists() {
        fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(trash_dir)
}

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // explorer /select,"<path>"
        // Using args carefully to match specific explorer syntax if needed.
        // Usually explorer /select,<path> works.
        // Command::new("explorer").args(["/select,", path]) often results in quoting issues if path has spaces: explorer "/select," "path" -> explorer might fail.
        // Safest on Windows is to construct the whole string if possible, or assume simple path handling.
        // But std::process::Command quotes args.
        // Workaround: Use "explorer" with single arg "/select,<path>"?
        // Let's try separate args first as it's cleaner.
        // If path has spaces, Command will quote "path". explorer /select,"path with space" works.
        // But "/select," shouldn't be quoted? It is weird.
        // Actually, Command::new("explorer").arg(format!("/select,{}", path)) works best if one arg.
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for non-windows (though user is on windows)
        // Just open the parent dir
        // ...
    }
    Ok(())
}
