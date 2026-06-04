use std::fs;
use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let doc_dir = app.path().document_dir().map_err(|e| e.to_string())?;
    let tdr_dir = doc_dir.join("TdA");
    fs::create_dir_all(&tdr_dir).map_err(|e| e.to_string())?;
    Ok(tdr_dir)
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
