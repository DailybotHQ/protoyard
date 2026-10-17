/**
 * Favorites and recently opened prototypes, per browser. localStorage can be
 * unavailable (private mode, blocked storage), so every access is guarded and
 * the gallery works without it.
 */

const FAVORITES_KEY = 'protoyard.gallery.favorites';
const RECENT_KEY = 'protoyard.gallery.recent';
const RECENT_LIMIT = 12;

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage unavailable
  }
}

class Library {
  favorites = $state<string[]>([]);
  recent = $state<string[]>([]);
  loaded = $state(false);

  load() {
    if (this.loaded) return;
    this.favorites = read(FAVORITES_KEY);
    this.recent = read(RECENT_KEY);
    this.loaded = true;
    // Keep several tabs in sync.
    window.addEventListener('storage', (event) => {
      if (event.key === FAVORITES_KEY) this.favorites = read(FAVORITES_KEY);
      if (event.key === RECENT_KEY) this.recent = read(RECENT_KEY);
    });
  }

  isFavorite(slug: string) {
    return this.favorites.includes(slug);
  }

  toggleFavorite(slug: string) {
    this.load();
    this.favorites = this.isFavorite(slug)
      ? this.favorites.filter((s) => s !== slug)
      : [slug, ...this.favorites];
    write(FAVORITES_KEY, this.favorites);
  }

  visit(slug: string) {
    this.load();
    this.recent = [slug, ...this.recent.filter((s) => s !== slug)].slice(0, RECENT_LIMIT);
    write(RECENT_KEY, this.recent);
  }

  clearRecent() {
    this.recent = [];
    write(RECENT_KEY, []);
  }
}

export const library = new Library();
