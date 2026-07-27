// Mini serveur réseau local côté Maître de Jeu — première étape du chantier réseau (voir la branche
// feature/reseau-local) : juste la plomberie (démarrer/arrêter un serveur WebSocket, voir des clients
// se connecter, relayer un message brut vers le frontend). Le protocole de jeu (jets, dégâts), le code
// de partie et le client joueur viendront dans une étape suivante, une fois cette base validée.
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;

// Port fixe pour cette première étape : plus simple à tester à la main (node, navigateur) et
// prévisible pour le futur mécanisme de découverte réseau. Deviendra sans doute configurable/annoncé
// plus tard — pas un problème à résoudre maintenant.
const PORT_RESEAU: u16 = 47821;

type EnvoiClient = mpsc::UnboundedSender<Message>;

#[derive(Default)]
pub struct EtatReseau {
    tache_serveur: Option<tauri::async_runtime::JoinHandle<()>>,
    port: Option<u16>,
    clients: Arc<Mutex<HashMap<u32, EnvoiClient>>>,
}

static PROCHAIN_ID_CLIENT: AtomicU32 = AtomicU32::new(1);

#[derive(Serialize, Clone)]
struct InfoConnexion {
    id: u32,
}

#[derive(Serialize, Clone)]
struct InfoMessage {
    id: u32,
    contenu: String,
}

#[derive(Serialize)]
pub struct EtatServeurInfo {
    demarre: bool,
    port: Option<u16>,
    clients: usize,
}

#[tauri::command]
pub async fn demarrer_serveur(
    app: AppHandle,
    state: State<'_, Mutex<EtatReseau>>,
) -> Result<u16, String> {
    let mut etat = state.lock().await;
    if etat.tache_serveur.is_some() {
        return Ok(etat.port.unwrap_or(PORT_RESEAU));
    }
    let listener = TcpListener::bind(("0.0.0.0", PORT_RESEAU))
        .await
        .map_err(|e| e.to_string())?;
    let clients = etat.clients.clone();
    let app_pour_tache = app.clone();
    let tache = tauri::async_runtime::spawn(async move {
        loop {
            let (flux, _adresse) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => break,
            };
            let clients = clients.clone();
            let app = app_pour_tache.clone();
            tauri::async_runtime::spawn(async move {
                gerer_client(flux, app, clients).await;
            });
        }
    });
    etat.tache_serveur = Some(tache);
    etat.port = Some(PORT_RESEAU);
    Ok(PORT_RESEAU)
}

// Une tâche par client connecté : une pour la réception (boucle sur les messages entrants, relayés au
// frontend), une pour l'envoi (relaie ce qu'on lui passe sur le canal vers le socket) — nécessaire pour
// pouvoir envoyer des messages à ce client depuis ailleurs (ex. plus tard : diffuser un résultat)
// pendant qu'on est aussi en train d'attendre ses messages entrants.
async fn gerer_client(flux: TcpStream, app: AppHandle, clients: Arc<Mutex<HashMap<u32, EnvoiClient>>>) {
    let ws = match tokio_tungstenite::accept_async(flux).await {
        Ok(ws) => ws,
        Err(_) => return,
    };
    let id = PROCHAIN_ID_CLIENT.fetch_add(1, Ordering::SeqCst);
    let (mut envoi_ws, mut reception_ws) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    clients.lock().await.insert(id, tx);
    let _ = app.emit("reseau:connexion", InfoConnexion { id });

    let tache_envoi = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if envoi_ws.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(msg) = reception_ws.next().await {
        match msg {
            Ok(Message::Text(texte)) => {
                let _ = app.emit(
                    "reseau:message",
                    InfoMessage {
                        id,
                        contenu: texte.to_string(),
                    },
                );
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    clients.lock().await.remove(&id);
    tache_envoi.abort();
    let _ = app.emit("reseau:deconnexion", InfoConnexion { id });
}

#[tauri::command]
pub async fn arreter_serveur(state: State<'_, Mutex<EtatReseau>>) -> Result<(), String> {
    let mut etat = state.lock().await;
    if let Some(tache) = etat.tache_serveur.take() {
        tache.abort();
    }
    etat.port = None;
    etat.clients.lock().await.clear();
    Ok(())
}

#[tauri::command]
pub async fn etat_serveur(state: State<'_, Mutex<EtatReseau>>) -> Result<EtatServeurInfo, String> {
    let etat = state.lock().await;
    let nb_clients = etat.clients.lock().await.len();
    Ok(EtatServeurInfo {
        demarre: etat.tache_serveur.is_some(),
        port: etat.port,
        clients: nb_clients,
    })
}
