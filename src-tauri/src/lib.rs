use std::fs;
use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // Android n'a pas de dossier Documents accessible — on utilise le répertoire privé de l'app
    #[cfg(target_os = "android")]
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "android"))]
    let dir = app.path().document_dir().map_err(|e| e.to_string())?.join("TdA");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn locale_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(data_dir(app)?.join("locales"))
}

#[tauri::command]
fn init_locale_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = locale_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.to_str().ok_or("path not utf8".into()).map(|s| s.to_string())
}

#[tauri::command]
fn locale_file_exists(app: tauri::AppHandle, path: String) -> Result<bool, String> {
    let full = locale_dir(&app)?.join(&path);
    Ok(full.exists())
}

#[tauri::command]
fn read_locale_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let full = locale_dir(&app)?.join(&path);
    fs::read_to_string(full).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_locale_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let full = locale_dir(&app)?.join(&path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(full, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_locale_dir(app: tauri::AppHandle, dir: String) -> Result<Vec<String>, String> {
    let full = locale_dir(&app)?.join(&dir);
    if !full.exists() {
        return Ok(vec![]);
    }
    let mut names = vec![];
    for entry in fs::read_dir(full).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[tauri::command]
fn load_data_file(app: tauri::AppHandle, filename: String) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(&filename);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_data_file(app: tauri::AppHandle, filename: String, content: String) -> Result<(), String> {
    let path = data_dir(&app)?.join(&filename);
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "android")]
    let _ = dir;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_data_file,
            save_data_file,
            open_data_dir,
            init_locale_dir,
            locale_file_exists,
            read_locale_file,
            write_locale_file,
            list_locale_dir,
        ])
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("TdA")
            .inner_size(1440.0, 900.0)
            .resizable(true)
            .disable_drag_drop_handler()
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
