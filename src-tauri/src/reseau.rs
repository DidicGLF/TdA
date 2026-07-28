// Mini serveur réseau local côté Maître de Jeu — première étape du chantier réseau (voir la branche
// feature/reseau-local) : juste la plomberie (démarrer/arrêter un serveur WebSocket, voir des clients
// se connecter, relayer un message brut vers le frontend). Le protocole de jeu (jets, dégâts), le code
// de partie et le client joueur viendront dans une étape suivante, une fois cette base validée.
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{mpsc, Mutex};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

// Port fixe pour cette première étape : plus simple à tester à la main (node, navigateur) et
// prévisible pour le futur mécanisme de découverte réseau. Deviendra sans doute configurable/annoncé
// plus tard — pas un problème à résoudre maintenant.
const PORT_RESEAU: u16 = 47821;
// Port UDP dédié à la découverte (code de partie) — distinct du port WebSocket, protocole différent.
const PORT_DECOUVERTE: u16 = 47820;
const DELAI_RECHERCHE: Duration = Duration::from_secs(3);

type EnvoiClient = mpsc::UnboundedSender<Message>;

#[derive(Default)]
pub struct EtatReseau {
    tache_serveur: Option<tauri::async_runtime::JoinHandle<()>>,
    tache_udp: Option<tauri::async_runtime::JoinHandle<()>>,
    port: Option<u16>,
    code: Option<String>,
    clients: Arc<Mutex<HashMap<u32, EnvoiClient>>>,
}

// Le code n'est pas un secret cryptographique, juste un identifiant de correspondance (comme un code de
// partie Jackbox) pour que le joueur tombe sur le bon MJ s'il y a plusieurs parties sur le même réseau
// local — communiqué de vive voix, pas besoin d'aléa cryptographique. Basé sur l'horloge plutôt que sur
// la dépendance `rand` (non déclarée dans Cargo.toml, et inutile pour ce besoin).
fn generer_code() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:04}", nanos % 10000)
}

// Enveloppe typée des paquets UDP de découverte — même convention que importTypage.ts côté frontend
// ({type, ...}) plutôt qu'un format ad hoc.
#[derive(Serialize, Deserialize)]
struct RequeteRecherche {
    #[serde(rename = "type")]
    type_: String,
    code: String,
}

#[derive(Serialize, Deserialize)]
struct ReponseRecherche {
    #[serde(rename = "type")]
    type_: String,
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

// Diagnostic temporaire de la découverte réseau — voir la note dans demarrer_serveur.
#[derive(Serialize, Clone)]
struct InfoDecouverte {
    source: String,
    code_recu: Option<String>,
    correspond: bool,
}

#[derive(Serialize)]
pub struct EtatServeurInfo {
    demarre: bool,
    port: Option<u16>,
    code: Option<String>,
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

    // Écoute UDP de découverte : répond uniquement aux requêtes portant le code généré ci-dessous, à
    // l'adresse source de la requête (déjà connue via recv_from, pas besoin de la redemander).
    let code = generer_code();
    let udp = UdpSocket::bind(("0.0.0.0", PORT_DECOUVERTE))
        .await
        .map_err(|e| e.to_string())?;
    let code_pour_tache = code.clone();
    let app_pour_udp = app.clone();
    let tache_udp = tauri::async_runtime::spawn(async move {
        let mut buf = [0u8; 256];
        loop {
            let (n, source) = match udp.recv_from(&mut buf).await {
                Ok(v) => v,
                Err(_) => break,
            };
            // Diagnostic temporaire (voir ReseauTab.tsx) : toute requête de découverte reçue est
            // journalisée côté MJ, correspondance ou pas — permet de voir si le paquet arrive du tout
            // avant de chercher plus loin (pare-feu, broadcast filtré par le réseau…).
            let Ok(requete) = serde_json::from_slice::<RequeteRecherche>(&buf[..n]) else {
                let _ = app_pour_udp.emit("reseau:decouverte", InfoDecouverte {
                    source: source.to_string(), code_recu: None, correspond: false,
                });
                continue;
            };
            let correspond = requete.type_ == "tda-recherche" && requete.code == code_pour_tache;
            let _ = app_pour_udp.emit("reseau:decouverte", InfoDecouverte {
                source: source.to_string(), code_recu: Some(requete.code.clone()), correspond,
            });
            if !correspond {
                continue;
            }
            let reponse = ReponseRecherche { type_: "tda-reponse".to_string() };
            if let Ok(octets) = serde_json::to_vec(&reponse) {
                let _ = udp.send_to(&octets, source).await;
            }
        }
    });
    etat.code = Some(code);
    etat.tache_udp = Some(tache_udp);

    Ok(PORT_RESEAU)
}

// Diffusée par le joueur (voir rechercher_partie) : le MJ dont le code démarré correspond répond, le
// joueur récupère l'IP du MJ via l'adresse source de cette réponse — pas besoin de la transmettre dans
// le paquet lui-même.
#[tauri::command]
pub async fn rechercher_partie(code: String) -> Result<Option<String>, String> {
    let socket = UdpSocket::bind(("0.0.0.0", 0)).await.map_err(|e| e.to_string())?;
    socket.set_broadcast(true).map_err(|e| e.to_string())?;
    let requete = RequeteRecherche { type_: "tda-recherche".to_string(), code };
    let octets = serde_json::to_vec(&requete).map_err(|e| e.to_string())?;
    socket
        .send_to(&octets, ("255.255.255.255", PORT_DECOUVERTE))
        .await
        .map_err(|e| e.to_string())?;

    // Boucle jusqu'au délai global : on peut recevoir du bruit réseau non lié (autre trafic broadcast
    // sur le même port), il ne faut pas le prendre pour une réponse valide.
    let mut buf = [0u8; 256];
    let echeance = tokio::time::Instant::now() + DELAI_RECHERCHE;
    loop {
        let restant = echeance.saturating_duration_since(tokio::time::Instant::now());
        if restant.is_zero() {
            return Ok(None);
        }
        let Ok(Ok((n, source))) = timeout(restant, socket.recv_from(&mut buf)).await else {
            return Ok(None);
        };
        if let Ok(reponse) = serde_json::from_slice::<ReponseRecherche>(&buf[..n]) {
            if reponse.type_ == "tda-reponse" {
                return Ok(Some(source.ip().to_string()));
            }
        }
    }
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

// Diffuse contenu à tous les clients actuellement connectés (test manuel côté MJ pour cette étape —
// voir ReseauTab.tsx) via les canaux mpsc déjà stockés par client (voir gerer_client) : aucune nouvelle
// plomberie, juste un envoi sur ce qui existe déjà.
#[tauri::command]
pub async fn envoyer_a_tous(contenu: String, state: State<'_, Mutex<EtatReseau>>) -> Result<(), String> {
    let etat = state.lock().await;
    let clients = etat.clients.lock().await;
    for tx in clients.values() {
        let _ = tx.send(Message::Text(contenu.clone().into()));
    }
    Ok(())
}

// Envoie contenu à UN seul client (protocole de jeu — voir reseauProtocole.ts côté frontend, ex. les
// dégâts reçus renvoyés au joueur ciblé) plutôt qu'à tout le monde comme envoyer_a_tous. Silencieux si
// l'id ne correspond à aucun client connecté (déconnecté entre-temps) — pas une erreur à signaler.
#[tauri::command]
pub async fn envoyer_a_client(id: u32, contenu: String, state: State<'_, Mutex<EtatReseau>>) -> Result<(), String> {
    let etat = state.lock().await;
    let clients = etat.clients.lock().await;
    if let Some(tx) = clients.get(&id) {
        let _ = tx.send(Message::Text(contenu.into()));
    }
    Ok(())
}

// Déconnecte UN seul client (voir la liste "Joueurs connectés" dans ReseauTab.tsx), sans toucher au
// serveur ni aux autres connexions — même mécanisme que arreter_serveur (envoi de Message::Close), mais
// ciblé sur un seul id. Pas besoin de retirer l'entrée de clients ici : gerer_client s'en charge déjà
// de lui-même en recevant le Close, et émettra reseau:deconnexion comme pour une déconnexion normale.
#[tauri::command]
pub async fn deconnecter_client(id: u32, state: State<'_, Mutex<EtatReseau>>) -> Result<(), String> {
    let etat = state.lock().await;
    let clients = etat.clients.lock().await;
    if let Some(tx) = clients.get(&id) {
        let _ = tx.send(Message::Close(None));
    }
    Ok(())
}

#[tauri::command]
pub async fn arreter_serveur(state: State<'_, Mutex<EtatReseau>>) -> Result<(), String> {
    let mut etat = state.lock().await;
    if let Some(tache) = etat.tache_serveur.take() {
        tache.abort();
    }
    if let Some(tache) = etat.tache_udp.take() {
        tache.abort();
    }
    etat.port = None;
    etat.code = None;
    // Ne pas se contenter de vider la liste de suivi : chaque client déjà connecté a sa propre tâche
    // (gerer_client) qui continue de tourner indépendamment de la boucle d'acceptation qu'on vient
    // d'arrêter — sans lui envoyer explicitement une trame Close, elle restait active indéfiniment en
    // arrière-plan (le serveur "arrêté" continuait de relayer les messages des clients déjà connectés).
    // Recevant Close, la boucle de lecture de gerer_client se termine d'elle-même (reception_ws.next()
    // finit par renvoyer None une fois la connexion fermée) et se retire proprement de la liste.
    let clients = etat.clients.lock().await;
    for tx in clients.values() {
        let _ = tx.send(Message::Close(None));
    }
    drop(clients);
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
        code: etat.code.clone(),
        clients: nb_clients,
    })
}
