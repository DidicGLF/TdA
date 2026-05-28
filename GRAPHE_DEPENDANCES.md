# Graphe de dépendances — Création de personnage

> Objectif : fournir la spécification nécessaire pour concevoir un éditeur  
> de création de personnage à base de nœuds, indépendant du wizard actuel.

---

## 1. Taxonomie des nœuds

Huit types primitifs suffisent à couvrir toutes les règles :

| Type | Rôle | Inputs | Output |
|------|------|--------|--------|
| **FREETEXT** | Saisie libre | — | `string` |
| **SELECT** | Choisir dans une liste | `source: DataTable` | `string` (clé) |
| **LOOKUP** | Lire un champ d'une table selon une clé | `table, key, field` | `any` |
| **DISTRIBUTE** | Assigner N valeurs fixes à M emplacements | `pool: number[]` | `Record<slot, number>` |
| **ROLLDIE** | Jet de dés avec règle keep-best | `NdX keep K` | `number` |
| **FORMULA** | Expression arithmétique sur des entrées | `variables` | `number` |
| **CONDITION** | Branchement if/else | `test, valueIfTrue, valueIfFalse` | `any` |
| **SPEND** | Dépenser un budget sur des options à coût variable | `budget, options[]` | `Record<option, count>` |

> **Note :** CONDITION peut être chaîné (switch multi-valeurs) pour les règles  
> de type `famille === 'combattants' ? X : famille === 'aventuriers' ? Y : Z`.

---

## 2. Valeurs et leurs types

### Entrées utilisateur (nœuds sources)

| Identifiant | Type | Nœud | Contrainte |
|-------------|------|------|-----------|
| `nomJoueur` | `string` | FREETEXT | requis |
| `nomPersonnage` | `string` | FREETEXT | requis |
| `genre` `age` `taille` `poids` | `string` | FREETEXT | — |
| `peuple` | `string` | SELECT(peuples) | requis |
| `culture` | `string` | SELECT(cultures du peuple) | requis, dépend de `peuple` |
| `carac_base[FOR…CHA]` | `number` | DISTRIBUTE([10,11,12,13,14,16]) | 6 valeurs à assigner |
| `voie1.nom` `voie2.nom` `voie3.nom` | `string` | SELECT(voies profil) | requis |
| `voiePrestige.nom` | `string` | SELECT(voies prestige) | optionnel |
| `rangs[voieX][0..4]` | `boolean` | SPEND(budget) | séquentiel |
| `formationsMartiales` | `string[]` | SELECT multiple | max selon famille |
| `talentMagique.nom` | `string` | SELECT(traits magiques) | mystiques seulement |
| `armes` `armuresEquipees` | `object[]` | SELECT(catalogue) | optionnel |
| `description` `inventaire` `tresorerie` | `string` | FREETEXT | — |
| `portrait` | `base64` | IMAGE | optionnel |

---

## 3. Graphe de dépendances complet

Les flèches indiquent **"est calculé à partir de"**.

```
COUCHE 0 — Entrées pures (aucune dépendance)
─────────────────────────────────────────────
peuple ──────────────────────────────────────────────────────────────┐
culture (← peuple) ──────────────────────────────────────────────────┤
carac_base[FOR..CHA]  ───────────────────────────────────────────────┤
voie1.nom / voie2.nom / voie3.nom ───────────────────────────────────┤
voiePrestige.nom ────────────────────────────────────────────────────┤
talentMagique.nom ───────────────────────────────────────────────────┤
formationsMartiales ─────────────────────────────────────────────────┤
niveau (fixe = 1 à la création) ─────────────────────────────────────┘


COUCHE 1 — Dérivés directs des entrées
──────────────────────────────────────────────────────────────────────
culture
  ├─→ modCaracs[FOR..CHA]     LOOKUP(peuples, peuple+culture, modCaracs)
  ├─→ voiePeuple.nom          LOOKUP(peuples, peuple+culture, voiePeuple)
  ├─→ voieCulturelle.nom      LOOKUP(peuples, peuple+culture, voieCulturelle)
  └─→ traitPeuple / desc      LOOKUP(peuples, peuple+culture, trait)

voie1.nom + voie2.nom + voie3.nom
  └─→ famille                 LOOKUP(voies, nom, famille) × 3
                              → majorité (≥2) : combattants / aventuriers / mystiques
                              → 3 voies sans majorité → aventuriers (défaut)


COUCHE 2 — Caractéristiques finales
─────────────────────────────────────────────────────────────────────
carac_base[X] + modCaracs[X]
  └─→ carac[X].valeur         FORMULA: base + racial

carac[X].valeur
  └─→ carac[X].mod            FORMULA: max(-4, floor((valeur - 10) / 2))


COUCHE 3 — Valeurs dérivées de famille
──────────────────────────────────────────────────────────────────────
famille
  ├─→ deVie                   CONDITION: combattants→d10 / aventuriers→d8 / mystiques→d6
  ├─→ deVie_val               CONDITION: combattants→10  / aventuriers→8  / mystiques→6
  ├─→ bonus_contact_distance  CONDITION: combattants→2   / aventuriers→1  / mystiques→0
  ├─→ bonus_magique            CONDITION: mystiques→2    / autres→0
  ├─→ coeff_pm                CONDITION: mystiques→2    / autres→1
  ├─→ bonus_pc                CONDITION: aventuriers→2  / autres→0
  └─→ max_formations          CONDITION: combattants→3  / aventuriers→2  / mystiques→1


COUCHE 4 — Scores dérivés finaux
──────────────────────────────────────────────────────────────────────
deVie_val + carac[CON].mod
  └─→ pvTotal                 FORMULA: deVie_val + CON.mod

peuple (contient "ogre" ?)
  └─→ pr                      CONDITION: ogre→6 / autres→5

(niveau + carac[SAG].mod) × coeff_pm
  └─→ pm                      FORMULA: max(0, (niveau + SAG.mod) × coeff_pm)

carac[CHA].mod + 2 + bonus_pc
  └─→ pc                      FORMULA: CHA.mod + 2 + bonus_pc

10 + carac[DEX].mod
  └─→ defense                 FORMULA: 10 + DEX.mod

carac[DEX].valeur
  └─→ initiative              FORMULA: DEX.valeur  (pas le modificateur)

niveau + carac[FOR].mod + bonus_contact_distance
  └─→ attaqueContact          FORMULA

niveau + carac[DEX].mod + bonus_contact_distance
  └─→ attaqueDistance         FORMULA

niveau + carac[INT].mod + bonus_magique
  └─→ attaqueMagique          FORMULA


COUCHE 5 — Budget de points de capacité
──────────────────────────────────────────────────────────────────────
niveau
  └─→ budget_pts              FORMULA: 2 × niveau

voie*.rangs (toutes les voies)
  └─→ pts_depenses            FORMULA: somme des coûts
                              coût rang r (0-indexé) :
                                voiePrestige → toujours 2
                                autres       → r < 2 ? 1 : 2

budget_pts - pts_depenses
  └─→ pts_disponibles         FORMULA (doit = 0 pour valider)
```

---

## 4. Nœuds spéciaux / cas particuliers

### DISTRIBUTE — Assignation des caractéristiques

```
pool = [10, 11, 12, 13, 14, 16]          (distribution fixe)
   OU  rolldie(4d6 keep 3) × 6           (aléatoire)

→ chaque valeur du pool est assignée à exactement un slot (FOR…CHA)
→ valeur finale = valeur assignée + modCarac racial
→ contrainte : chaque valeur du pool utilisée une seule fois
```

### SPEND — Rangs de voies

```
budget = pts_disponibles
pour chaque voie active :
  options = rangs disponibles dans l'ordre (séquentiel obligatoire)
  coût = selon la règle rang/type ci-dessus
→ contrainte : rang N impossible sans rang N-1
→ contrainte globale : total dépensé = budget
```

### Dérivation de famille (règle de majorité)

```
input : voie1.famille, voie2.famille, voie3.famille
counts = { combattants: 0, aventuriers: 0, mystiques: 0 }

pour chaque voie :
  counts[voie.famille]++

si counts.combattants ≥ 2 → combattants
si counts.mystiques   ≥ 2 → mystiques
si counts.aventuriers ≥ 2 → aventuriers
si 3 voies choisies sans majorité → aventuriers
sinon → null (bloquant)
```

---

## 5. Ordre d'évaluation recommandé

Pour un moteur de résolution de nœuds, l'ordre topologique est :

```
1. FREETEXT / SELECT sources          (aucune dép.)
2. modCaracs                          (← peuple, culture)
3. voiePeuple, voieCulturelle, trait  (← peuple, culture)
4. carac[X].valeur                    (← carac_base, modCaracs)
5. carac[X].mod                       (← carac[X].valeur)
6. famille                            (← voie1/2/3 + table voies)
7. deVie, deVie_val, bonus_*          (← famille)
8. pvTotal, pm, pc, pr, defense,      (← mods + famille + niveau)
   initiative, attaques
9. budget_pts                         (← niveau)
10. pts_depenses                      (← rangs de toutes les voies)
11. pts_disponibles                   (← budget - dépenses)
```

---

## 6. Ce qui est fixé par le système (non modifiable par l'utilisateur)

Ces règles sont propres à CoF et ne devraient pas être exposées comme nœuds configurables :

- Formule du modificateur : `max(-4, floor((val - 10) / 2))`
- Règle de majorité famille
- Coûts des rangs (1 / 2 / 2 pour prestige)
- Séquentialité des rangs
- Valeurs du pool de distribution : `[10, 11, 12, 13, 14, 16]`
- Budget de capacité : `2 × niveau`

---

## 7. Ce qui est configurable (données utilisateur)

Ce sont les tables de données que l'interface node doit permettre de créer/modifier :

| Table | Champs clés |
|-------|-------------|
| `peuples` | label, cultures[], modCaracs, voiePeuple, voieCulturelle, trait |
| `voies` | nom, famille (combattants/aventuriers/mystiques), categorie (profil/prestige) |
| `descriptions` | \[nomVoie\]: [{ nom, desc, effects }] × 5 rangs |
| `profils` | nom, famille, voies[3], formationsMartiales[], talentMagique? |
| `traits-magiques` | nom, desc |
| `armes / armures` | catalogue |

---

## 8. Implications pour le design du node editor

### Nœuds d'interaction utilisateur (affichés pendant la création)

```
[FREETEXT "Nom du personnage"]
[SELECT peuple → liste peuples]
[SELECT culture → filtrée par peuple]
[DISTRIBUTE caracs → pool [10,11,12,13,14,16]]
[SELECT voie1 → liste voies profil]
[SELECT voie2 → liste voies profil, exclure voie1]
[SELECT voie3 → liste voies profil, exclure voie1+2]
[SPEND budget_pts → rangs de toutes les voies]
[SELECT formations → max selon famille]
[SELECT talentMagique → si famille=mystiques]
```

### Nœuds de calcul (invisibles pour l'utilisateur final)

```
[LOOKUP culture → modCaracs, voiePeuple, voieCulturelle, trait]
[FORMULA carac.valeur = base + racial]
[FORMULA carac.mod = max(-4, floor((v-10)/2))]
[FORMULA famille ← majorité voies]
[CONDITION famille → deVie / bonus_famille / coeff_pm / ...]
[FORMULA pvTotal = deVie_val + CON.mod]
[FORMULA pm = max(0, (niv + SAG.mod) × coeff_pm)]
[FORMULA pc = CHA.mod + 2 + bonus_pc]
[CONDITION peuple → pr (5 ou 6)]
[FORMULA defense = 10 + DEX.mod]
[FORMULA initiative = DEX.valeur]
[FORMULA attaques = niv + mod + bonus_famille]
```

### Nœud de sortie

Un seul nœud `CHARACTER_OUTPUT` agrège tous les champs du personnage final.  
C'est le point d'entrée pour la fiche de personnage.
