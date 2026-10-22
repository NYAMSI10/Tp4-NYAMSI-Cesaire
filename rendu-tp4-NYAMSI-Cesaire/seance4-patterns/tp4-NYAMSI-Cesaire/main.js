// Composition et démonstration : on assemble fabrique, builder, adaptateurs, décorateurs et façade.
import { createChannel } from './notifications/channels.js';
import './notifications/slack.js'; // ajoute le canal Slack sans toucher à channels.js
import { MessageBuilder } from './notifications/MessageBuilder.js';
import { ColissimoApi, DhlClient, ColissimoAdapter, DhlAdapter } from './shipping/adapters.js';
import { RetryQuote, CachedQuote } from './shipping/decorators.js';
import { ShippingService } from './shipping/ShippingService.js';

// DHL est parfois indisponible : le retry absorbe la panne, le cache (à l'extérieur) évite les appels répétés
const shipping = new ShippingService([
  new CachedQuote(new RetryQuote(new ColissimoAdapter(new ColissimoApi()))),
  new CachedQuote(new RetryQuote(new DhlAdapter(new DhlClient({ failFirst: 1 })))),
]);

const email = createChannel('email');
for (const weightKg of [2, 10]) {
  const best = await shipping.bestQuote({ weightKg, zip: '75011' });
  const message = new MessageBuilder()
    .to('alice@exemple.fr')
    .template(
      'Bonjour {{nom}}, votre colis de {{poids}} kg part avec {{transporteur}} ({{prix}} €).',
    )
    .with('nom', 'Alice')
    .with('poids', weightKg)
    .with('transporteur', best.carrier)
    .with('prix', best.price.toFixed(2))
    .build();
  console.log(email.send(message));
}

console.log(
  createChannel('slack').send({ to: 'logistique', body: 'Tarifs mis à jour', priority: 'basse' }),
);
