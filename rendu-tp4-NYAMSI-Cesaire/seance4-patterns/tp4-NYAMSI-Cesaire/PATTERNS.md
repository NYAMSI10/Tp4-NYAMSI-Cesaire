# PATTERNS — TP 4 · binôme NYAMSI / Cesaire · parcours Dev

## Tableau des patterns

| Pattern | Problème résolu dans ShopLite | Alternative écartée | Pourquoi écartée |
|---|---|---|---|
| **Factory Method + registre** (`createChannel`, `registerChannel`) | ShopLite prévient ses clients par plusieurs canaux (e-mail, SMS, push) et l'équipe logistique veut Slack. Le code appelant ne doit connaître qu'un nom de canal (`'email'`, `'slack'`), pas les classes concrètes, et ajouter un canal ne doit pas toucher au code existant. | Un `switch (type)` dans `createChannel`. | Chaque nouveau canal oblige à modifier et re-tester `channels.js` (violation d'OCP). Avec la `Map`, `slack.js` s'enregistre lui-même : `channels.js` reste intact (vérifié par un test). Le contrôle `instanceof Channel` dans `registerChannel` évite d'enregistrer une classe sans `send()`. |
| **Builder** (`MessageBuilder`) | Un message de notification a un destinataire, un gabarit à variables `{{nom}}`, des valeurs et une priorité facultative. On veut le construire lisiblement, étape par étape, et ne jamais envoyer un message incomplet (variable non remplie, priorité fantaisiste). | Un constructeur `new Message(to, template, vars, priority)` ou un objet littéral. | Paramètres positionnels illisibles, facultatifs mal gérés, et la validation serait soit absente, soit dispersée. Le Builder centralise **toutes** les règles dans `build()` (validation en une fois, quel que soit l'ordre des appels) et renvoie un objet gelé (`Object.freeze`) qu'aucun canal ne peut altérer. |
| **Adapter** (`ColissimoAdapter`, `DhlAdapter`) | Les deux transporteurs ont des API non modifiables et incompatibles : synchrone/asynchrone, grammes/kilos, centimes/texte `"11.00"`, `delaiJours`/`transitDays`. ShopLite veut un seul contrat `getQuote({ weightKg, zip }) → { carrier, price, days }`. | Faire les conversions directement dans `ShippingService` (`if (carrier === 'dhl') …`). | La façade connaîtrait les détails de chaque API et grossirait à chaque nouveau transporteur. Avec un adaptateur par transporteur, les conversions sont isolées et testables, et un transporteur s'ajoute en écrivant un adaptateur, sans toucher à la façade. |
| **Decorator** (`RetryQuote`, `CachedQuote`) | DHL tombe parfois en 503 et interroger les transporteurs coûte du temps : on veut ajouter nouvelle tentative et cache **sans modifier** les adaptateurs, et pouvoir choisir ces comportements transporteur par transporteur. | Ajouter le retry et le cache dans chaque adaptateur, ou une sous-classe `CachedRetryDhlAdapter`. | Code dupliqué dans chaque adaptateur, et explosion combinatoire des sous-classes (retry seul, cache seul, les deux × chaque transporteur). Les décorateurs ont la même interface `getQuote(parcel)` que ce qu'ils enveloppent, donc ils s'empilent librement : `new CachedQuote(new RetryQuote(new DhlAdapter(…)))`. |
| **Facade** (`ShippingService`) | Le reste de l'application (commande, notification) veut juste « le meilleur tarif ». Il ne doit pas gérer l'appel parallèle, les pannes ni la règle de choix (moins cher, puis plus rapide). | Laisser chaque appelant boucler sur les transporteurs et gérer les erreurs. | Logique dupliquée et fragile : un seul transporteur en panne ferait échouer tout l'appel avec un `Promise.all`. La façade expose une seule méthode `bestQuote()`, utilise `Promise.allSettled` pour ignorer les transporteurs en panne et lève « Aucun transporteur disponible » seulement si aucun ne répond. |

## Pourquoi le cache doit-il envelopper le retry, et pas l'inverse ?

Composition retenue : `CachedQuote( RetryQuote( adaptateur ) )`.

- **Cache à l'extérieur** : le cache ne voit que le **résultat final** du retry. Il ne mémorise que des devis obtenus avec succès (une erreur est relancée et jamais mise en cache). Un devis en cache évite *tout* le travail en dessous : ni appel réseau, ni tentatives supplémentaires.
- **Retry à l'extérieur** (`RetryQuote( CachedQuote( adaptateur ) )`) : chaque tentative passe par le cache. Si le cache mémorisait les réponses telles quelles, on risquerait de **mettre en cache un échec ou une réponse dégradée** (ex. la 503 ou un résultat partiel) : les tentatives suivantes reliraient ce même échec depuis le cache et le retry deviendrait inutile jusqu'à l'expiration du TTL. Même avec un cache qui n'enregistre que les succès, le retry ne protège plus rien qui soit « au-dessus » du cache et l'ordre devient trompeur.

Règle : on met en cache **ce qu'on veut réutiliser**, c'est-à-dire la réponse finale, fiable, après que le retry a absorbé les pannes transitoires. Le test « composition cache(retry(dhl)) » le vérifie : 1 panne + 1 succès, puis le 2e appel est servi par le cache (`client.calls === 2`).

## Vérifications avant rendu

- [x] Problèmes formulés dans le contexte ShopLite.
- [x] Alternative crédible avec une raison précise pour chaque pattern.
- [x] Code fourni intact : `tp4/carrierApis.js` importé, jamais modifié ; `channels.js` non modifié par l'ajout de Slack.
- [x] Tests verts : `node --test seance4-patterns/tp4-NYAMSI-Cesaire/tp4.test.js` → 15 / 15.
