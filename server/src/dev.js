import { config } from './config.js';
import app from './app.js';

app.listen(config.port, () => {
  console.log(`TCG Bracket server listening on http://localhost:${config.port}`);
});
