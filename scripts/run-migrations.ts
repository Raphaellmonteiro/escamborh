import 'dotenv/config';
import { runMigrations } from '../src/db';

runMigrations()
  .then(() => {
    console.log('Migrações concluídas.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
