# Hyppo Patrimoine

Le cockpit de ta vie financière. Chaque euro reçu a un rôle, décidé par tes règles et pas par l'humeur du moment.

- **Quand tu reçois de l'argent (30 secondes)** : tu saisis la somme, l'appli te dit exactement quels virements faire.
- **Une fois par mois (10 minutes)** : une revue guidée compare le prévu au réel, gère les reliquats et prépare le mois suivant.
- **Quand tu veux prendre du recul** : patrimoine, objectifs, projection, rétrospective annuelle.

Pas de serveur, pas de connexion bancaire. Tout est calculé et stocké dans ton navigateur.

## Données personnelles

Le code est public, mais **il ne contient aucune donnée personnelle**. La configuration livrée n'est qu'un exemple générique. Au premier lancement, un assistant te fait saisir la tienne : revenus, comptes et soldes, enveloppes (niveau et plancher), abonnements, matelas et objectifs. Elle est enregistrée **uniquement dans ton navigateur** (IndexedDB) et n'est jamais envoyée nulle part.

L'assistant propose aussi **Importer une sauvegarde JSON**, pour retrouver tes données d'une autre installation.

Le dossier `private/` (exclu de Git) peut contenir tes propres jeux de tests. Vitest et Playwright les lancent localement s'il existe.

---

## 1. Lancer l'appli en local

Prérequis : Node.js 22.

```bash
npm install
npm run dev
```

Ouvre ensuite <http://localhost:3000/hyppo-patrimoine/>.

| Commande | Rôle |
|---|---|
| `npm run test` | Tests du moteur et de la base (Vitest) |
| `npm run build` | Vérification TypeScript et version de production dans `dist/` |
| `npm run preview` | Sert la version de production sur <http://localhost:4173/hyppo-patrimoine/> |
| `npm run e2e` | Compile, puis lance les tests de bout en bout Playwright (format iPhone) |
| `npm run icons` | Régénère les icônes de l'appli |

## 2. Mise en ligne : GitHub Pages

À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` installe les dépendances, lance les tests, compile, puis publie `dist/` sur GitHub Pages. L'appli est servie sous `https://<pseudo>.github.io/hyppo-patrimoine/` :
- le chemin de base est réglé dans `vite.config.ts` ;
- la navigation passe par l'ancre de l'adresse (`#/mois`…), ce qui évite tout besoin de réécriture d'URL ;
- le manifeste et le service worker de la PWA sont limités à `/hyppo-patrimoine/`.

Si tu renommes le dépôt, change la constante `BASE` dans `vite.config.ts`.

## 3. L'installer sur ton iPhone

1. Ouvre l'adresse de l'appli dans **Safari**.
2. Touche **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Lance Hyppo depuis l'icône : l'appli s'ouvre en plein écran et fonctionne ensuite **hors ligne**.

Les données de l'icône de l'écran d'accueil sont distinctes de celles de l'onglet Safari.

## 4. Sauvegarder et restaurer tes données

Tes données ne vivent **que sur ton appareil**. Si tu supprimes l'appli, ou si iOS vide le stockage, elles disparaissent. L'appli te rappelle de sauvegarder quand la dernière sauvegarde a plus de 30 jours.

- **Sauvegarder** : Réglages → Données → **Exporter mes données**. Range le fichier JSON dans iCloud Drive ou dans l'appli Fichiers.
- **Restaurer** : Réglages → Données → **Importer une sauvegarde**, ou **Importer une sauvegarde JSON** dès le premier écran. Les données actuelles sont remplacées, code PIN compris.
- **Code oublié** : il ne peut pas être récupéré (seule son empreinte est stockée). Sur l'écran de verrouillage, touche « Code oublié ? » pour tout réinitialiser, puis restaure ta dernière sauvegarde.

---

## Comment ça marche

### La répartition en cascade

1. On part du montant reçu.
2. Les enveloppes sont remplies par ordre de priorité : chacune reçoit `min(reste, objectif − déjà financé ce mois)`.
3. S'il reste de l'argent, la règle de surplus s'applique (par exemple 80 % en Épargne, 20 % en Sorties).
4. L'Épargne suit les phases :
   - **Phase 1** : tout va sur le compte du matelas (le Livret A, par exemple) jusqu'au matelas cible.
   - **Phase 2** : répartition sur tes placements (PEA, assurance-vie, CTO…) selon les parts que tu choisis.
   - À la transition, on complète exactement le matelas et le reste suit la phase 2.
5. Les montants sont regroupés par compte : ce sont les virements à faire. Ils sont arrondis à l'euro par la méthode du plus fort reste, donc la somme des virements vaut toujours exactement le montant reçu. Les éventuels centimes restent sur le compte de réception.

Modifier ou supprimer un encaissement recalcule toute l'histoire dans l'ordre chronologique. Un virement déjà coché n'est jamais effacé : l'appli propose un **virement d'ajustement** pour la différence.

Changer une règle ou une enveloppe s'applique au mois en cours et aux suivants. Les mois passés gardent la configuration figée de l'époque.

### Architecture

```
src/
├─ engine/       logique métier en fonctions pures, testée (Vitest)
│  ├─ allocation.ts   cascade, surplus, phases, arrondis
│  ├─ recompute.ts    recalcul chronologique complet
│  ├─ reconcile.ts    virements souhaités vs virements cochés (ajustements)
│  ├─ review.ts       reliquats, reports, conseil du mois
│  ├─ health.ts       indicateurs de santé et alertes
│  ├─ income.ts       revenus attendus, retards, suggestion de source
│  ├─ goals.ts · projection.ts · retrospective.ts · balances.ts
│  ├─ plan.ts         revenu prévu, niveaux, adaptation du budget, jours ouvrés
│  ├─ subscriptions.ts abonnements : équivalents mensuels, dates, calendrier, prix
│  ├─ revolutCsv.ts   import CSV Revolut et règles apprises
│  └─ ics.ts          rappel mensuel et abonnements pour le calendrier
├─ db/           Dexie (IndexedDB), actions, sauvegarde
├─ state/        données en direct, navigation, verrou, mode discret
├─ ui/           design system (montants animés, feuilles, pavés…)
└─ screens/      les écrans
e2e/             tests Playwright publics (iPhone 14, WebKit) + audit axe-core
.github/         déploiement GitHub Pages
```

Tous les montants sont stockés en **centimes entiers**.

### Un budget qui s'adapte à tes revenus

Chaque mois a un **revenu prévu** :
- le montant réel pour un revenu déjà reçu ;
- le montant reçu plus le reste attendu pour un revenu reçu en partie ;
- sinon le montant attendu ;
- plus les autres encaissements (commissions…).

Le montant attendu d'un mois suit cet ordre : montant reçu, puis exception du mois, puis montant habituel en vigueur, puis valeur par défaut.

Chaque enveloppe a un **niveau** et un **plancher**, modifiables dans les Réglages :
- **Essentiel** : jamais réduit (par exemple Abonnements, Logement, Courses) ;
- **Important** : réduit en second, jusqu'à son plancher (par exemple Épargne, Provision vacances) ;
- **Flexible** : réduit en premier, jusqu'à son plancher (par exemple Sorties, Marge).

Quand le revenu prévu est inférieur au budget normal, le déficit est absorbé dans cet ordre :
1. les Flexibles jusqu'à leur plancher, au prorata de leur marge ;
2. puis les Importants jusqu'à leur plancher ;
3. puis, en dernier recours, sous les planchers.

Si même l'essentiel n'est pas couvert, l'appli propose un renfort depuis le matelas (Livret A). Quand le revenu est supérieur, les objectifs restent normaux et le surplus suit la règle de surplus.

- **Plan du mois** (écran Mois) : les revenus prévus, le bandeau « Mois normal / serré / confortable », les enveloppes réduites avec leur explication. Tu peux aussi fixer à la main l'objectif d'une enveloppe pour un mois.
- **Et si je reçois…** : un simulateur qui montre le budget adapté en direct, sans rien enregistrer.
- **Prévisions** : 12 mois glissants. Pour chaque mois, tu peux saisir un montant attendu (avec un motif), marquer un versement « ne viendra pas », rétablir le montant habituel ou estimer une retenue pour jours non payés. Le bouton **Changement durable** enregistre un nouveau salaire à partir d'un mois choisi, sans réécrire les mois passés.
- **À la réception** d'un salaire différent de l'attendu (plus de 5 % ou plus de 20 € d'écart), l'appli demande si c'est exceptionnel ou ton nouveau salaire habituel.
- Tout changement recalcule aussitôt les répartitions. Un virement déjà coché qui change donne un **ajustement à régulariser**, jamais une réécriture silencieuse.

### Abonnements et calendrier

- **Abonnements** (Accueil → Raccourcis, ou Réglages) : liste filtrable, coût annuel, part de tes revenus, anneau par catégorie, évolution du coût mensuel. L'ajout prend quelques secondes grâce aux suggestions (montants indicatifs, modifiables).
- **Enveloppe Abonnements** : son objectif est **calculé automatiquement**. C'est la somme des équivalents mensuels des abonnements actifs (un annuel compte pour 1/12, un trimestriel pour 1/3, un hebdomadaire pour × 52/12), arrondie à l'euro supérieur. L'argent est versé sur le compte réellement débité par chaque abonnement.
- **Un changement d'abonnement** (ajout, prix, pause, résiliation) s'applique au mois en cours et aux suivants. Si un virement déjà coché change, l'appli affiche un **ajustement à régulariser** au lieu de réécrire l'historique.
- **Calendrier** : il affiche les prélèvements (pastilles), les fenêtres des revenus attendus (pointillés) et les encaissements (trait doré). Touche un jour pour le détail, balaie pour changer de mois. La vue « À venir » donne un compte à rebours.
- **Export `.ics`** : chaque abonnement devient un événement récurrent dans le Calendrier de l'iPhone, avec un rappel la veille à 9 h. Un prélèvement prévu le 31 tombe le dernier jour des mois plus courts.
- **Revue mensuelle** : une étape « Abonnements » te demande pour chacun s'il sert encore, puis affiche l'économie annuelle réalisée grâce aux résiliations.
- **Annuels et trimestriels** : l'enveloppe les lisse chaque mois. Le mois de l'échéance, la réserve accumulée sur le compte couvre le prélèvement.

### Astuces

- **Mode discret** : touche l'œil en haut de chaque écran, ou fais un appui à deux doigts n'importe où. Les montants sont aussi floutés quand l'appli passe en arrière-plan.
- **Appui long sur le bouton doré « + »** : accès rapide à « Utiliser une provision ».
- **Import Revolut** : dans Revolut, Compte → Relevé → Excel/CSV. Corrige une catégorie une fois, l'appli retient la règle.
- **Rappel de revue** : Réglages → Apparence → Rappel de revue → Exporter vers mon calendrier.

## Limites connues

- **Vibration** : Safari sur iPhone ne gère pas l'API de vibration. L'appli utilise l'interrupteur natif d'iOS 18 et plus pour produire un léger retour haptique ; sur les versions plus anciennes, il n'y a pas de vibration.
- **Pas de synchronisation** entre appareils : c'est le prix du 100 % local. Utilise l'export et l'import.
- **Import CSV** : il est calé sur le format officiel de Revolut (en-têtes anglais ou français). Les mouvements internes (pockets, recharges, changes) sont ignorés. Si Revolut change de format, l'import peut demander un ajustement.
- **Soldes projetés** : les livrets et placements sont projetés à partir du dernier relevé et des virements prévus. Les intérêts et les variations de marché n'apparaissent que lorsque tu mets les valeurs à jour dans Patrimoine.
- **Simulateur** : il repose sur une hypothèse de rendement, sans garantie. Ce n'est pas un conseil en investissement.
