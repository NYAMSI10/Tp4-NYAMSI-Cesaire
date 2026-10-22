# REVUE croisée — TP 4 · parcours Dev

Binôme relu : <nom du binôme relu> · relu par : NYAMSI / Cesaire

## Grille de vérification

| Point vérifié | Résultat | Commentaire |
|---|---|---|
| `channels.js` intact après l'ajout de Slack | ☐ oui ☐ non | |
| Validation uniquement dans `build()` | ☐ oui ☐ non | |
| Décorateurs de même interface et composables | ☐ oui ☐ non | |
| Façade robuste aux pannes (`Promise.allSettled`) | ☐ oui ☐ non | |

## Remarque 1 · Le cache ne doit mémoriser que les succès

Vérifier que `CachedQuote` n'enregistre pas une promesse rejetée (par exemple en stockant
`this.inner.getQuote(parcel)` avant l'`await`). Sinon, une panne transitoire de DHL resterait
en cache pendant tout le TTL et le transporteur serait « en panne » pour ShopLite pendant
60 s, même si le retry aurait pu réussir. Correction : n'écrire dans le cache qu'après un
`await` réussi, et ajouter un test « une erreur n'est pas mise en cache ».

## Remarque 2 · La validation ne doit pas fuiter hors de `build()`

Si `priority('urgente')` lève immédiatement une erreur, la règle « validé une seule fois dans
`build()` » n'est plus respectée : les règles sont alors dispersées entre les setters et
`build()`, et l'ordre des appels change le comportement. Recommandation : les méthodes
fluides se contentent de mémoriser et renvoient `this` ; toutes les vérifications
(destinataire, gabarit, priorité, variables manquantes) sont regroupées dans `build()`, qui
renvoie un objet gelé (`Object.freeze`). Un test peut le prouver : `priority('urgente')` ne
lève rien, `build()` lève « Priorité invalide : urgente ».
