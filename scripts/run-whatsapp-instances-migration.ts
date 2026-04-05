import 'dotenv/config';
import { ensureWhatsAppInstancesTable } from '../src/db/migrations/whatsappInstances';

ensureWhatsAppInstancesTable()
  .then(() => {
    console.log('Tabela whatsapp_instances garantida com sucesso.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
