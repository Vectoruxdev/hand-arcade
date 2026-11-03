// Boot.
// Phase 0: an empty, correctly styled page so the tooling has something to check.
// Phase 1 (plan v2, 1.2): db.open() → Audio.create() → HandService.create() → router.start().

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');

app.dataset['phase'] = '0';
console.info('hand-arcade: phase 0, empty hub');
