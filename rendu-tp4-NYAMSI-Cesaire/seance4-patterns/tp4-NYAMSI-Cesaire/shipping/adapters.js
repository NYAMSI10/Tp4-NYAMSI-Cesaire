// Adapter : ramener deux API de transporteurs hétérogènes à NOTRE contrat unique :
//   getQuote({ weightKg, zip }) -> Promise<{ carrier, price, days }>   (price en euros, nombre)
export { ColissimoApi, DhlClient } from '../../tp4/carrierApis.js';

export class ColissimoAdapter {
  constructor(api) {
    this.api = api;
  }
  async getQuote({ weightKg, zip }) {
    // API synchrone, en grammes et en centimes
    const { prixCentimes, delaiJours } = this.api.tarif({
      poidsGrammes: weightKg * 1000,
      codePostal: zip,
    });
    return { carrier: 'Colissimo', price: prixCentimes / 100, days: delaiJours };
  }
}

export class DhlAdapter {
  constructor(client) {
    this.client = client;
  }
  async getQuote({ weightKg, zip }) {
    // API asynchrone, en kilos, montant renvoyé sous forme de texte
    const { amount, transitDays } = await this.client.getRate(weightKg, zip);
    return { carrier: 'DHL', price: Number(amount), days: transitDays };
  }
}
