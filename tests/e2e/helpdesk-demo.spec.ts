import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { HELPDESK_DEMO, PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Beacon Help Desk: a flagship produced by `protoyard generate` from
 * prototypes/helpdesk-demo/blueprint.json. Runs on the static build in a
 * fresh browser context per test (desktop and mobile projects).
 */

test.skip(
  !PROTOTYPE_TARGETS.includes(HELPDESK_DEMO),
  `set PROTOYARD_E2E_PROTOTYPES to include ${HELPDESK_DEMO}`
);

async function open(page: Page, route = '/', scenario?: string) {
  const query = scenario ? `?scenario=${scenario}` : '';
  await page.goto(`${prototypeUrl(HELPDESK_DEMO)}${query}#${route}`);
  await waitForPrototypeReady(page, { slug: HELPDESK_DEMO });
}

const rowCheckboxes = (page: Page) => page.getByRole('checkbox', { name: /^Select row Open / });

test('dashboard shows SLA counters and the ticket board, and is accessible', async ({
  page,
}, testInfo) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Beacon Help Desk' })).toBeVisible();
  await expect(page.getByText('SLA breached')).toBeVisible();
  for (const status of ['open', 'pending', 'on-hold', 'solved']) {
    await expect(page.getByTestId(`board-${status}`)).toBeVisible();
  }
  await expectAccessible(page, testInfo, { label: 'dashboard' });
});

test('moves a ticket across the board and keeps it after a reload', async ({ page }) => {
  await open(page);
  const open$ = page.getByTestId('board-open');
  const first = open$.getByRole('link').first();
  const subject = (await first.textContent())?.trim() ?? '';
  await open$.getByRole('button', { name: `Move “${subject}” to Pending` }).click();
  await expect(
    page.getByTestId('board-pending').getByRole('link', { name: subject })
  ).toBeVisible();
  await page.reload();
  await waitForPrototypeReady(page, { slug: HELPDESK_DEMO });
  await expect(
    page.getByTestId('board-pending').getByRole('link', { name: subject })
  ).toBeVisible();
});

test('creates and edits a ticket through the generated forms', async ({ page }) => {
  await open(page, '/tickets');
  await page.getByRole('button', { name: 'New' }).click();
  await page
    .getByRole('textbox', { name: 'Subject' })
    .fill('Printer queue stuck on the third floor');
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('customer_0001');
  await page.getByRole('button', { name: /^Create / }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
  await page.getByRole('searchbox').fill('Printer queue');
  await page.getByRole('row', { name: 'Open Printer queue stuck on the third floor' }).click();

  // The row opens the hand-written workspace (the generated detail view below repeats
  // the title, hence .first()); Edit opens the generated form.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Printer queue stuck on the third floor' }).first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Subject' }).fill('Printer queue stuck (floor 3)');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('searchbox').fill('floor 3');
  await expect(page.getByRole('row', { name: 'Open Printer queue stuck (floor 3)' })).toBeVisible();
});

test('bulk-moves tickets to trash, undoes it, and undoes a single delete', async ({ page }) => {
  await open(page, '/tickets');
  await expect(rowCheckboxes(page).first()).toBeVisible();
  const labels = await Promise.all(
    [0, 1].map(async (i) => (await rowCheckboxes(page).nth(i).getAttribute('aria-label')) ?? '')
  );
  for (const name of labels) await page.getByRole('checkbox', { name, exact: true }).check();
  await page.getByRole('button', { name: 'Delete 2' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  // Soft delete is on for tickets, so a bulk delete moves them to Trash with an Undo.
  const bulkToast = page.locator('li', { hasText: 'Moved 2 records to trash' });
  await expect(bulkToast).toBeVisible();
  for (const name of labels) {
    await expect(page.getByRole('checkbox', { name, exact: true })).toHaveCount(0);
  }
  await bulkToast.getByRole('button', { name: 'Undo' }).click();
  for (const name of labels) {
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
  }

  const label = (await rowCheckboxes(page).first().getAttribute('aria-label')) ?? '';
  await rowCheckboxes(page).first().check();
  await page.getByRole('button', { name: 'Delete 1' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('checkbox', { name: label, exact: true })).toHaveCount(0);
  await page
    .locator('li', { hasText: 'Moved 1 record to trash' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeVisible();
});

test('imports tickets from CSV', async ({ page }) => {
  await open(page, '/tickets');
  const csv = [
    'subject,status,priority,channel,customerId',
    'Imported: SSO login loop,open,high,email,customer_0002',
    'Imported: Invoice PDF missing,pending,normal,chat,customer_0003',
  ].join('\n');
  await page.locator('[data-entity-list="ticket"] input[type="file"]').setInputFiles({
    name: 'tickets.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText('Imported 2 rows', { exact: true }).first()).toBeVisible();
  await page.getByRole('searchbox').fill('Imported:');
  await expect(page.getByRole('row', { name: /^Open Imported: / })).toHaveCount(2);
});

test('finds a ticket with the search palette and attaches a file by drag and drop', async ({
  page,
}) => {
  await open(page);
  const subject = (
    (await page.getByTestId('board-open').getByRole('link').first().textContent()) ?? ''
  ).trim();
  await page.getByRole('button', { name: 'Search workspace (⌘K)' }).click();
  await page.getByPlaceholder('Search tickets, customers, replies…').fill(subject.slice(0, 18));
  await page.getByRole('option', { name: subject }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: subject }).first()).toBeVisible();

  // Drop a real File on the drop zone, like dragging it from the desktop.
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['printer error log'], 'printer-log.txt', { type: 'text/plain' }));
    return data;
  });
  await page.locator('[data-file-dropzone-zone]').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByText('Attached printer-log.txt', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('printer-log.txt').first()).toBeVisible();
});

test('a viewer persona is read-only', async ({ page }, testInfo) => {
  await open(page, '/tickets', 'viewer');
  await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New' })).toHaveCount(0);
  await open(page, '/', 'viewer');
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await page.getByTestId('board-open').getByRole('link').first().click();
  await expect(page.getByText('Your role can view attachments but not add them.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(0);
  await expectAccessible(page, testInfo, { label: 'workspace-viewer' });
});
