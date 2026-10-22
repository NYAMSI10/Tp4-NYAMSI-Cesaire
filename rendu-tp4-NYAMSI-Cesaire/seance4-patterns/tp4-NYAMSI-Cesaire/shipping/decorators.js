// Decorator : ajouter nouvelle tentative et cache en ENVELOPPANT un transporteur,
// en gardant exactement la même interface getQuote(parcel). Les décorateurs sont composables.

export class RetryQuote {
  constructor(inner, { attempts = 3 } = {}) {
    this.inner = inner;
    this.attempts = attempts;
  }
  async getQuote(parcel) {
    let lastError;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await this.inner.getQuote(parcel);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }
}

export class CachedQuote {
  #cache = new Map();
  constructor(inner, { ttlMs = 60_000, now = Date.now } = {}) {
    this.inner = inner;
    this.ttlMs = ttlMs;
    this.now = now;
  }
  async getQuote(parcel) {
    const key = `${parcel.weightKg}|${parcel.zip}`;
    const hit = this.#cache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.quote;
    // Seuls les succès sont mémorisés : une erreur n'est jamais mise en cache
    const quote = await this.inner.getQuote(parcel);
    this.#cache.set(key, { quote, at: this.now() });
    return quote;
  }
}
