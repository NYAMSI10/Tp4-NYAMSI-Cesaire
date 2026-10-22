# TP 4 · Patterns créationnels et structuraux · parcours Dev

Binôme : NYAMSI / Cesaire · Architecture Logicielle · M1 INGETIS

ShopLite : notifications (Factory Method, Builder) et client de transporteurs résilient
(Adapter, Decorator, Facade).

Prérequis : Node.js 20 ou plus récent, aucune dépendance.

```bash
npm test        # 15 tests
npm run demo    # démonstration console
```

| Fichier | Pattern |
|---|---|
| `seance4-patterns/tp4-NYAMSI-Cesaire/notifications/channels.js`, `slack.js` | Factory Method + registre (OCP) |
| `seance4-patterns/tp4-NYAMSI-Cesaire/notifications/MessageBuilder.js` | Builder |
| `seance4-patterns/tp4-NYAMSI-Cesaire/shipping/adapters.js` | Adapter |
| `seance4-patterns/tp4-NYAMSI-Cesaire/shipping/decorators.js` | Decorator (retry, cache) |
| `seance4-patterns/tp4-NYAMSI-Cesaire/shipping/ShippingService.js` | Facade |
| `seance4-patterns/tp4/carrierApis.js` | API des transporteurs fournie (non modifiée) |

Justifications : `seance4-patterns/tp4-NYAMSI-Cesaire/PATTERNS.md` · revue croisée : `REVUE.md`.
