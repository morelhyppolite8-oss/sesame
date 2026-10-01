import { exportBackup } from '../db/actions';
import { toISODate } from '../engine/dates';
import { downloadFile } from './files';

/** Télécharge une sauvegarde JSON complète et note la date de sauvegarde. */
export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup();
  downloadFile(`hyppo-patrimoine-${toISODate(new Date())}.json`, JSON.stringify(backup, null, 2), 'application/json');
}
