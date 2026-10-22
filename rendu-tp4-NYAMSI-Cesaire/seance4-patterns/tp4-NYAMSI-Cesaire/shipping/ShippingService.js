// Facade : une seule méthode simple pour le reste de ShopLite, qui masque
// l'interrogation parallèle des transporteurs, les pannes et le choix du meilleur devis.
export class ShippingService {
  constructor(carriers = []) {
    this.carriers = carriers;
  }

  async bestQuote(parcel) {
    const results = await Promise.allSettled(this.carriers.map(c => c.getQuote(parcel)));
    const quotes = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (quotes.length === 0) throw new Error('Aucun transporteur disponible');
    // Le moins cher ; à prix égal, le plus rapide
    return quotes.reduce((best, q) =>
      q.price < best.price || (q.price === best.price && q.days < best.days) ? q : best,
    );
  }
}
