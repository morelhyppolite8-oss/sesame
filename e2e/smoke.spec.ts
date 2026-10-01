/*
 * Tests publics de bout en bout, sur les valeurs d'EXEMPLE de l'assistant (aucune donnée personnelle).
 * L'appli est servie sous /sesame/, comme sur GitHub Pages.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TEST_PIN = '2468';

test.describe.configure({ mode: 'serial' });

let page: Page;
const errors: string[] = [];
let backupPath = '';

const money = (n: string) => new RegExp(n.replace(/ /g, '[\\s\\u00a0\\u202f]'));

async function tapPin(p: Page) {
  const pad = p.getByRole('group', { name: 'Clavier du code' });
  for (const d of TEST_PIN) await pad.getByRole('button', { name: d, exact: true }).click();
}

test.afterAll(async () => {
  await page.context().close();
});

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ ...test.info().project.use });
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.clock.install({ time: new Date('2026-11-02T19:00:00+01:00') });
});

test('assistant du premier lancement', async () => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Sésame' })).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await tapPin(page);
  await expect(page.getByRole('heading', { name: 'Confirme ton code' })).toBeVisible();
  await tapPin(page);

  await expect(page.getByRole('heading', { name: 'Ce que tu reçois' })).toBeVisible();
  await page.locator('#inc-amount-0').fill('1800');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Soldes de départ' })).toBeVisible();
  await page.locator('#bal-courant').fill('1200');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Tes enveloppes' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Tes abonnements' })).toBeVisible();
  await page.getByRole('button', { name: 'Netflix' }).click();
  await page.locator('#sub-day-0').selectOption('12');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Matelas et objectifs' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Tout est prêt' })).toBeVisible();
  await expect(page.getByText(money('1 800 €'))).toBeVisible();
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await expect(page.getByText(/Reste à recevoir/)).toBeVisible();
});

test('encaissement, répartition et plan du mois', async () => {
  await page.goto('./#/encaissement');
  const keypad = page.getByRole('group', { name: 'Pavé numérique' });
  for (const k of '1800') await keypad.getByRole('button', { name: k, exact: true }).click();
  await page.getByRole('radio', { name: 'Salaire', exact: true }).click();
  await page.getByRole('button', { name: /budget/ }).click();
  await page.locator('#date').fill('2026-11-27');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByRole('button', { name: /Répartir/ }).click();
  await expect(page.getByText('Tes virements')).toBeVisible();
  await expect(page.getByText(money('Vire 649 € vers le Livret A'))).toBeVisible();
  await expect(page.getByText(money('Vire 627 € vers le Compte de dépenses'))).toBeVisible();
  await expect(page.getByText(money('Vire 130 € vers le LDDS'))).toBeVisible();
  await expect(page.getByText(money('394 € restent sur ton Compte courant'))).toBeVisible();

  await page.goto('./#/mois');
  await expect(page.getByText(money('Mois confortable : \\+186 €'))).toBeVisible();
  await page.goto('./#/previsions');
  await expect(page.getByRole('heading', { name: 'Prévisions' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^décembre 2026/ })).toBeVisible();
});

test('export, puis import par l’assistant sur un autre appareil', async ({ browser }) => {
  await page.goto('./#/reglages/donnees');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  backupPath = (await (await download).path())!;

  const other = await browser.newContext({ ...test.info().project.use });
  const fresh = await other.newPage();
  await fresh.goto('./');
  await fresh.getByLabel('Fichier de sauvegarde à importer').setInputFiles(backupPath);
  await expect(fresh.getByText(/Reste à recevoir/)).toBeVisible();
  await fresh.goto('./#/abonnements');
  await expect(fresh.getByRole('button', { name: 'Modifier l’abonnement Netflix' })).toBeVisible();
  await other.close();
});

test('accessibilité (axe-core, WCAG AA), thèmes sombre et ivoire', async () => {
  const routes = ['./#/', './#/mois', './#/virements', './#/previsions', './#/abonnements', './#/calendrier', './#/objectifs', './#/patrimoine', './#/reglages', './#/reglages/enveloppes'];
  const violations: string[] = [];
  for (const theme of ['Sombre', 'Ivoire']) {
    await page.goto('./#/reglages/apparence');
    await page.getByRole('radio', { name: theme }).click();
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(250);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of result.violations) violations.push(`${theme} ${route} · ${v.id}`);
    }
  }
  expect(violations).toEqual([]);
});

test('aucune erreur dans la console', async () => {
  expect(errors).toEqual([]);
});
