# Pistes — Éditeur de création de personnage par nœuds

> Document de passation. À lire avec `CREATION_PERSONNAGE.md` et `GRAPHE_DEPENDANCES.md`.

---

## Contexte

L'application TdA (Tauri + React + TypeScript) contient un wizard de création de
personnage CoF en 8 étapes codé en dur. L'objectif est de construire une **nouvelle
app** permettant à un utilisateur (MJ, éditeur de jeu) de définir ses propres règles
de création via un éditeur de nœuds, puis à un joueur de l'utiliser pour créer son
personnage.

L'existant dans Tabula (`/home/didic/Documents/Développement/Tabula/`) montre un
éditeur de nœuds fonctionnel basé sur `@xyflow/react` v12 — bonne source d'inspiration
pour la partie canvas.

---

## Trois sous-systèmes à construire

### 1. L'éditeur de graphe (pour le concepteur)

Canvas XYFlow où l'on pose et connecte des nœuds.

**8 types de nœuds à implémenter** (définis dans `GRAPHE_DEPENDANCES.md`) :

| Type | Ce qu'il fait |
|------|--------------|
| FREETEXT | Saisie texte libre |
| SELECT | Choix dans une liste (statique ou issue d'une DataTable) |
| LOOKUP | Lecture d'un champ dans une table selon une clé d'entrée |
| DISTRIBUTE | Assignation d'un pool de valeurs à des slots (ex: caracs) |
| ROLLDIE | Jet de dés `NdX keep K` |
| FORMULA | Expression arithmétique (`a + b`, `max(x, y)`, etc.) |
| CONDITION | Switch multi-valeurs (`if A then X else if B then Y else Z`) |
| SPEND | Dépense d'un budget sur des options à coût variable |

Chaque nœud a des **handles d'entrée** (valeurs reçues) et **handles de sortie**
(valeurs produites). Les connexions forment un DAG.

Un nœud `CHARACTER_OUTPUT` terminal agrège tous les champs du personnage final.

**Décisions de design à prendre :**
- Typage des handles (`number`, `string`, `boolean`, `string[]`, `Record<string,number>`)  
  Les connexions doivent être validées par type.
- Nœuds d'interaction vs. nœuds de calcul : les premiers sont visibles du joueur,
  les seconds sont invisibles. Il faut un moyen de les distinguer dans l'éditeur.
- Comment exprimer les DataTables (peuples, voies, etc.) dans le graphe — probablement
  comme nœuds sources connectés aux SELECT/LOOKUP.

---

### 2. Le format de sérialisation (ruleset.json)

Le graphe doit être persisté. Format suggéré :

```typescript
type Ruleset = {
  _type: 'ruleset'
  _version: string
  meta: { name: string; system: string; author?: string }
  nodes: RuleNode[]
  edges: RuleEdge[]
  dataTables: DataTable[]
}

type RuleNode = {
  id: string
  kind: 'FREETEXT' | 'SELECT' | 'LOOKUP' | 'DISTRIBUTE' |
        'ROLLDIE' | 'FORMULA' | 'CONDITION' | 'SPEND' | 'OUTPUT'
  x: number; y: number          // position canvas
  label?: string                 // alias affiché
  data: Record<string, unknown>  // config propre au kind
  interaction: boolean           // true = visible du joueur
  order?: number                 // ordre d'affichage côté joueur
}

type RuleEdge = {
  id: string
  source: string; sourceHandle: string
  target: string; targetHandle: string
}

type DataTable = {
  id: string
  name: string
  rows: Record<string, unknown>[]
}
```

---

### 3. Le moteur d'évaluation (pour le joueur)

Lit un `ruleset.json`, affiche les nœuds d'interaction au joueur dans l'ordre,
évalue les nœuds de calcul, produit un `character.json`.

**Algorithme clé — tri topologique :**

```
1. Construire le DAG depuis les edges
2. Trier les nœuds en ordre topologique (Kahn ou DFS)
3. Pour chaque nœud dans l'ordre :
   a. Si INTERACTION → afficher l'UI, attendre la saisie
   b. Si CALCUL      → évaluer immédiatement avec les valeurs déjà résolues
4. Quand OUTPUT est atteint → character résolu
```

**Point délicat — réactivité :**  
Quand une valeur change (ex: l'utilisateur change de peuple), tous les nœuds
qui en dépendent doivent se recalculer. Deux approches :
- **Réévaluation totale** à chaque changement (simple, suffisant pour des graphes
  de cette taille)
- **Invalidation partielle** (sous-graphe impacté seulement) — plus complexe,
  à réserver si les perfs posent problème

**Évaluation des FORMULA :**  
Prévoir un mini-interpréteur d'expressions. La lib `mathjs` ou `expr-eval` couvre
les besoins (opérations arithmétiques, `max`, `min`, `floor`). Éviter `eval()`.

---

## Ce qui est fixé par CoF (non exposé dans l'éditeur)

Ces règles sont des constantes du système, pas des nœuds configurables :

- `mod(v) = max(-4, floor((v - 10) / 2))`
- Budget capacité = `2 × niveau`
- Coût rang (0-indexé) : `rang < 2 ? 1 : 2` (prestige : toujours 2)
- Séquentialité des rangs (rang N impossible sans rang N-1)
- Pool distribution fixe : `[10, 11, 12, 13, 14, 16]`
- Règle de majorité famille : ≥ 2 voies d'une même famille → cette famille

Elles peuvent être câblées en dur dans le moteur ou exprimées comme des nœuds
FORMULA/CONDITION verrouillés (non éditables) dans un "ruleset CoF de base".

---

## Stack technique suggérée

- **Canvas** : `@xyflow/react` v12 (déjà utilisé dans Tabula)
- **Évaluation expressions** : `mathjs` ou `expr-eval`
- **Persistance** : même pattern que TdA — JSON dans Documents/, auto-save
- **UI** : même design system que TdA/Tabula (Tauri v2 + React 19 + TS + Vite)

---

## Fichiers de référence

| Fichier | Contenu |
|---------|---------|
| `CREATION_PERSONNAGE.md` | Règles CoF complètes avec formules |
| `GRAPHE_DEPENDANCES.md` | DAG complet, taxonomie des nœuds, ordre d'évaluation |
| `src/components/CreationWizard.tsx` | Implémentation de référence (wizard actuel) |
| `src/utils/levelUp.ts` | Formules de points de capacité et de rangs |
| `src/types/character.ts` | Structure complète du personnage |
| `/home/didic/Documents/Développement/Tabula/src/components/editor/NodesEditor.tsx` | Éditeur de nœuds XYFlow existant à réutiliser |
