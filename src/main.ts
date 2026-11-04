// Boot. Plan v2, section 1.2: db.open → services → router.start.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import './hub/styles/tokens.css';
import './hub/styles/base.css';
import './hub/styles/screens.css';

import { db } from './data/db.ts';
import { getGame } from './games/registry.ts';
import { createApp } from './hub/app.ts';
import { mountDebug } from './hub/debug.ts';
import { boardsScreen } from './hub/screens/boards.ts';
import { detailScreen } from './hub/screens/detail.ts';
import { playScreen } from './hub/screens/play.ts';
import { shelfScreen } from './hub/screens/shelf.ts';
import { welcomeScreen } from './hub/screens/welcome.ts';
import { whoScreen } from './hub/screens/who.ts';

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing #app');

await db.open();
const app = await createApp(root);

const needsActivation = () =>
  app.activated || app.hands.source !== 'camera' || app.hands.state === 'tracking' ? null : '#/';
const needsProfile = () => needsActivation() ?? (app.profile ? null : '#/who');
const knownGame = () => {
  const id = location.hash.split('/')[2]?.split('?')[0] ?? '';
  return needsProfile() ?? (getGame(id) ? null : '#/shelf');
};

app.router
  .add({ pattern: '#/', make: () => welcomeScreen(app) })
  .add({ pattern: '#/who', make: () => whoScreen(app), guard: needsActivation })
  .add({ pattern: '#/shelf', make: () => shelfScreen(app), guard: needsProfile })
  .add({ pattern: '#/shelf/:id', make: () => shelfScreen(app), guard: needsProfile })
  .add({ pattern: '#/game/:id', make: () => detailScreen(app), guard: knownGame })
  .add({ pattern: '#/play/:id', make: () => playScreen(app), guard: knownGame })
  .add({ pattern: '#/boards', make: () => boardsScreen(app), guard: needsProfile });

app.router.onChange(() => app.cursor.invalidate());
app.router.start('#/');

if (new URLSearchParams(location.search).get('debug') === '1') mountDebug(app);
console.info(`hand-arcade: hub up, ${app.bot ? 'bot' : app.hands.source} source`);
