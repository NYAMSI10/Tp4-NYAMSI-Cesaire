import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  Channel,
  EmailChannel,
  SmsChannel,
  PushChannel,
  createChannel,
  registerChannel,
} from './notifications/channels.js';
import { MessageBuilder } from './notifications/MessageBuilder.js';
import { ColissimoApi, DhlClient, ColissimoAdapter, DhlAdapter } from './shipping/adapters.js';
import { RetryQuote, CachedQuote } from './shipping/decorators.js';
import { ShippingService } from './shipping/ShippingService.js';

const msg = { to: 'alice@exemple.fr', body: 'Bonjour', priority: 'normale' };
const parcel = { weightKg: 2, zip: '75011' };

// Faux transporteur : compte ses appels, échoue sur demande
const stubCarrier = (quote, { fail = false } = {}) => ({
  calls: 0,
  async getQuote() {
    this.calls++;
    if (fail) throw new Error('503 Service Unavailable');
    return quote;
  },
});

// --- Étape 1 · Factory -------------------------------------------------------
test('Factory : un canal par type, erreur si inconnu', () => {
  assert.ok(createChannel('email') instanceof EmailChannel);
  assert.ok(createChannel('sms') instanceof SmsChannel);
  assert.ok(createChannel('push') instanceof PushChannel);
  assert.equal(createChannel('email').send(msg), '[EMAIL → alice@exemple.fr] Bonjour');
  assert.equal(createChannel('push').send(msg), '[PUSH → alice@exemple.fr] Bonjour');
  const long = createChannel('sms').send({ ...msg, to: '0600000000', body: 'x'.repeat(300) });
  assert.equal(long, `[SMS → 0600000000] ${'x'.repeat(160)}`);
  assert.throws(() => createChannel('pigeon'), /Canal inconnu : pigeon/);
  assert.throws(() => new Channel().send(msg), /méthode abstraite/);
});

test('Factory : une classe qui n’hérite pas de Channel est refusée', () => {
  assert.throws(() => registerChannel('fax', class Fax {}), /hériter de Channel/);
  assert.throws(() => createChannel('fax'), /Canal inconnu/);
});

test('Factory (OCP) : Slack ajouté sans modifier channels.js', async () => {
  const source = await readFile(new URL('./notifications/channels.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /slack/i);
  assert.throws(() => createChannel('slack'), /Canal inconnu : slack/);
  await import('./notifications/slack.js');
  assert.equal(
    createChannel('slack').send({ to: 'logistique', body: 'Tarifs mis à jour' }),
    '[SLACK #logistique] Tarifs mis à jour',
  );
});

// --- Étape 2 · Builder -------------------------------------------------------
const validBuilder = () =>
  new MessageBuilder()
    .to('alice@exemple.fr')
    .template('Bonjour {{nom}}, votre colis part avec {{transporteur}}.')
    .with('nom', 'Alice')
    .with('transporteur', 'Colissimo');

test('Builder : message valide, priorité normale par défaut', () => {
  assert.deepEqual(validBuilder().priority('haute').build(), {
    to: 'alice@exemple.fr',
    body: 'Bonjour Alice, votre colis part avec Colissimo.',
    priority: 'haute',
  });
  assert.equal(validBuilder().build().priority, 'normale');
});

test('Builder : les 4 erreurs sont levées par build()', () => {
  assert.throws(
    () => new MessageBuilder().template('x').build(),
    /^Error: Destinataire obligatoire$/,
  );
  assert.throws(() => new MessageBuilder().to('a').build(), /^Error: Gabarit obligatoire$/);
  // priority() n'échoue pas : la validation n'a lieu que dans build()
  const b = validBuilder().priority('urgente');
  assert.throws(() => b.build(), /^Error: Priorité invalide : urgente$/);
  assert.throws(
    () => new MessageBuilder().to('a').template('Bonjour {{nom}}').build(),
    /^Error: Variable manquante : nom$/,
  );
});

test('Builder : interface fluide et message gelé', () => {
  const b = new MessageBuilder();
  assert.equal(b.to('a'), b);
  assert.equal(b.template('t'), b);
  assert.equal(b.with('k', 'v'), b);
  assert.equal(b.priority('basse'), b);
  const m = validBuilder().build();
  assert.ok(Object.isFrozen(m));
  assert.throws(() => {
    'use strict';
    m.body = 'piraté';
  }, TypeError);
});

// --- Étape 3a · Adapter ------------------------------------------------------
test('Adapter : Colissimo et DHL respectent le même contrat', async () => {
  assert.deepEqual(await new ColissimoAdapter(new ColissimoApi()).getQuote(parcel), {
    carrier: 'Colissimo',
    price: 9.95,
    days: 2,
  });
  assert.deepEqual(await new DhlAdapter(new DhlClient()).getQuote(parcel), {
    carrier: 'DHL',
    price: 11,
    days: 1,
  });
  await assert.rejects(
    new ColissimoAdapter(new ColissimoApi()).getQuote({ weightKg: 2, zip: 'abc' }),
    /Code postal invalide/,
  );
});

// --- Étape 3b · Decorator ----------------------------------------------------
test('Decorator Retry : absorbe 2 pannes sur 3 essais', async () => {
  const client = new DhlClient({ failFirst: 2 });
  const quote = await new RetryQuote(new DhlAdapter(client)).getQuote(parcel);
  assert.equal(quote.price, 11);
  assert.equal(client.calls, 3);
});

test('Decorator Retry : abandonne après 3 échecs et relance la dernière erreur', async () => {
  const client = new DhlClient({ failFirst: 5 });
  await assert.rejects(
    new RetryQuote(new DhlAdapter(client), { attempts: 3 }).getQuote(parcel),
    /503 Service Unavailable/,
  );
  assert.equal(client.calls, 3);
});

test('Decorator Cache : évite le 2e appel, puis expire', async () => {
  let t = 0;
  const inner = stubCarrier({ carrier: 'X', price: 5, days: 1 });
  const cached = new CachedQuote(inner, { ttlMs: 1000, now: () => t });
  await cached.getQuote(parcel);
  await cached.getQuote(parcel);
  assert.equal(inner.calls, 1);
  await cached.getQuote({ weightKg: 3, zip: '75011' }); // autre clé poids|code postal
  assert.equal(inner.calls, 2);
  t = 1000; // expiration
  await cached.getQuote(parcel);
  assert.equal(inner.calls, 3);
});

test('Decorator : composition cache(retry(dhl))', async () => {
  const client = new DhlClient({ failFirst: 1 });
  const carrier = new CachedQuote(new RetryQuote(new DhlAdapter(client)));
  assert.deepEqual(await carrier.getQuote(parcel), { carrier: 'DHL', price: 11, days: 1 });
  assert.deepEqual(await carrier.getQuote(parcel), { carrier: 'DHL', price: 11, days: 1 });
  assert.equal(client.calls, 2); // 1 panne + 1 succès, puis cache
});

// --- Étape 4 · Facade --------------------------------------------------------
const realCarriers = () => [
  new CachedQuote(new RetryQuote(new ColissimoAdapter(new ColissimoApi()))),
  new CachedQuote(new RetryQuote(new DhlAdapter(new DhlClient({ failFirst: 1 })))),
];

test('Facade : le moins cher (2 kg → Colissimo, 10 kg → DHL)', async () => {
  const shipping = new ShippingService(realCarriers());
  assert.equal((await shipping.bestQuote({ weightKg: 2, zip: '75011' })).carrier, 'Colissimo');
  const heavy = await shipping.bestQuote({ weightKg: 10, zip: '75011' });
  assert.deepEqual(heavy, { carrier: 'DHL', price: 23, days: 1 });
});

test('Facade : à prix égal, le plus rapide', async () => {
  const shipping = new ShippingService([
    stubCarrier({ carrier: 'Lent', price: 10, days: 3 }),
    stubCarrier({ carrier: 'Rapide', price: 10, days: 1 }),
  ]);
  assert.equal((await shipping.bestQuote(parcel)).carrier, 'Rapide');
});

test('Facade : un transporteur en panne est ignoré', async () => {
  const shipping = new ShippingService([
    stubCarrier(null, { fail: true }),
    new DhlAdapter(new DhlClient()),
  ]);
  assert.equal((await shipping.bestQuote(parcel)).carrier, 'DHL');
});

test('Facade : aucun transporteur (liste vide ou tous en panne) → erreur', async () => {
  await assert.rejects(new ShippingService([]).bestQuote(parcel), /Aucun transporteur disponible/);
  await assert.rejects(
    new ShippingService([stubCarrier(null, { fail: true })]).bestQuote(parcel),
    /Aucun transporteur disponible/,
  );
});
