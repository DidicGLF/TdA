# Création de personnage — Référence technique

> Système : Chroniques Oubliées Fantasy (CoF)  
> Source : `CreationWizard.tsx`, `levelUp.ts`, `character.ts`

---

## Séquence des étapes (8 étapes, 0-indexées)

| # | Nom | Obligatoire |
|---|-----|-------------|
| 0 | Identité | Nom joueur + nom personnage |
| 1 | Peuple & Culture | Peuple + culture |
| 2 | Caractéristiques | Au moins une valeur ≠ 10 |
| 3 | Profil & Voies | Famille + 3 voies + 0 pts restants |
| 4 | Scores dérivés | PV > 0 |
| 5 | Spécialisation | (facultatif sauf formations) |
| 6 | Équipement | (facultatif) |
| 7 | Finalisation | Récap + sauvegarde |

---

## Étape 1 — Peuple & Culture

- Chaque **culture** d'un peuple définit :
  - `voiePeuple` : nom de la voie du peuple (lecture seule à l'étape 3)
  - `voieCulturelle` : nom de la voie culturelle (lecture seule à l'étape 3)
  - `modCaracs` : `Record<Caracteristique, number>` — modificateurs raciaux additifs
  - `trait` : `{ nom, desc }` — trait racial (affiché en lecture seule si présent dans les données)

- Source de données : `peuples.json` (chargé via `GameDataContext`)

---

## Étape 2 — Caractéristiques

### Valeurs de base disponibles

**Distribution fixe** (défaut) :

```
[10, 11, 12, 13, 14, 16]
```

**Aléatoire** : 6 jets de `4d6`, on garde les 3 meilleurs dés, résultats triés.

### Assignation

- Chaque valeur est assignée à une des 6 caractéristiques : `FOR DEX CON INT SAG CHA`
- La valeur finale = valeur assignée + modificateur racial de la culture

### Modificateur de caractéristique

```
mod = max(-4, floor((valeur - 10) / 2))
```

---

## Étape 3 — Profil & Voies

### Deux modes

| Mode | Comportement |
|------|-------------|
| **Libre** | Le joueur choisit 3 voies de profil librement parmi `voies.json` (catégorie `profil`) |
| **Par profil** | Sélection d'un profil prédéfini (`profils.json`) qui fixe les 3 voies, les formations martiales et suggère un talent magique |

### Points de capacité

```
total = 2 × niveau (= 2 au niveau 1)
```

Répartis entre les voies actives (peuple, culturelle, voie1/2/3).

### Coût d'un rang

| Rang (0-indexé) | Coût |
|-----------------|------|
| 0, 1 | 1 pt |
| 2, 3, 4 | 2 pts |

**Voie de prestige uniquement** : tous les rangs coûtent **2 pts**.

Les rangs s'acquièrent séquentiellement (rang 1 avant rang 2, etc.).

### Détermination de la famille

La famille est dérivée des 3 voies de profil choisies :

```
counts = { combattants: 0, aventuriers: 0, mystiques: 0 }
pour chaque voie (voie1/2/3) :
  counts[famille de la voie]++

si counts.combattants >= 2  → combattants
si counts.mystiques   >= 2  → mystiques
si counts.aventuriers >= 2  → aventuriers
si 3 voies choisies sans majorité → aventuriers (défaut)
sinon → null (famille non déterminée)
```

---

## Étape 4 — Scores dérivés

Tous les scores sont calculés automatiquement et appliqués via `onChange` à chaque changement de dépendance.

| Score | Formule |
|-------|---------|
| **PV** | dé de vie + Mod.CON |
| **PM** | Niv + Mod.SAG (× 2 si Mystiques) |
| **PC** | Mod.CHA + 2 (+ 2 si Aventuriers) |
| **PR** | 5 (6 pour les Ogres) |
| **DEF** | 10 + Mod.DEX |
| **INIT** | Valeur DEX (pas le modificateur) |
| **Att. contact** | Niv + Mod.FOR + bonus famille |
| **Att. distance** | Niv + Mod.DEX + bonus famille |
| **Att. magique** | Niv + Mod.INT + bonus famille |

### Dé de vie et bonus d'attaque par famille

| Famille | Dé de vie | Bonus contact/distance | Bonus magique |
|---------|-----------|----------------------|---------------|
| Combattants | d10 | +2 | +0 |
| Aventuriers | d8 | +1 | +0 |
| Mystiques | d6 | +0 | +2 |

---

## Étape 5 — Spécialisation

### Formations martiales

| Famille | Nombre (hors paysan) |
|---------|----------------------|
| Combattants | 3 |
| Aventuriers | 2 |
| Mystiques | 1 |

"Armes de paysan" est gratuit et toujours présent.

Liste complète : Armes de duel, Armes de guerre, Armes de guerre lourdes, Armes de jet, Armes de tir, Armes de trait, Armes d'hast, Armures légères, Armures lourdes.

### Voie de prestige

- Choisie librement parmi `voies.json` (catégorie `prestige`)
- Disponible à la création (optionnelle) — obligatoire uniquement à partir du niveau 8 lors du level-up
- Tous ses rangs coûtent **2 pts** chacun

### Talent magique

- Réservé aux **Mystiques** (interface désactivée pour les autres familles)
- Sélectionné parmi `traits-magiques.json`
- Le nom et la description sont éditables manuellement

---

## Étape 7 — Validation (récapitulatif)

### Éléments requis (bloquants)

- Nom du joueur renseigné
- Nom du personnage renseigné
- Peuple renseigné
- Culture renseignée
- Profil renseigné (mode profil uniquement)
- Famille déterminée
- Voie 1, 2, 3 choisies
- 0 points de capacité restants
- PV > 0
- Formations martiales complètes (selon la famille)

### Éléments conseillés (non bloquants)

- Armes ou armures choisies
- Talent magique (Mystiques)
- Portrait

---

## Level-up (post-création)

Source : `LevelUpModal.tsx`, `levelUp.ts`

### Points de capacité gagnés

```
+2 pts par niveau gagné
```

### Gains automatiques par niveau

- Attaque contact, distance, magique : **+1 chacune**
- PM : **+1** (Combattants/Aventuriers) ou **+2** (Mystiques)

### Dé de vie

- On lance `1 × dé de vie de la famille` par niveau gagné
- Résultat + Mod.CON du niveau en question = PV gagnés
- Le Mod.CON est recalculé à chaque rang si CON a changé dans le niveau courant

### Voie de prestige (niveau 8)

- Débloquée à partir du niveau 8
- Si une nouvelle voie de prestige est choisie au niveau 8, elle est disponible pour dépenser des points dès ce niveau

### Réinitialisation

- Retour au niveau 1 : tous les rangs de toutes les voies effacés
- PV, PM, attaques restaurés depuis le snapshot `niveau1Base` (capturé lors du premier level-up depuis le niveau 1)
- Si `niveau1Base` absent : PV/PM/attaques remis à 0

### Niveau maximum : 20

---

## Voies — structure de données

```typescript
type VoiePersonnage = {
  nom: string
  rangs: boolean[]  // length 5, index 0 = rang 1
}

// 7 voies par personnage :
// voiePeuple, voieCulturelle, voie1, voie2, voie3, voiePrestige, voieSangMele
```

Les rangs sont toujours acquis séquentiellement : `rangs[i]` ne peut être `true` que si `rangs[i-1]` l'est aussi.

---

## Structures de données externes

| Fichier | Contenu |
|---------|---------|
| `peuples.json` | Peuples, cultures, modificateurs, voies, traits raciaux |
| `voies.json` | Métadonnées des voies : `{ nom, famille, categorie }` |
| `descriptions.json` | Contenu des rangs : `{ [nomVoie]: RangEntry[] }` |
| `profils.json` | Profils prédéfinis groupés par famille |
| `traits-magiques.json` | Liste des talents magiques disponibles |
| `armes.json` | Catalogue d'armes groupé par catégorie |
| `armures.json` | Catalogue d'armures |
