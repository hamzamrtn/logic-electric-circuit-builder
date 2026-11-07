import { expect, type Page } from '@playwright/test';

export async function openParts(page: Page, family: 'Electrical' | 'Logic' | 'Connections' = 'Electrical') {
  if (!await page.getByRole('dialog', { name: 'Parts library', exact: true }).isVisible()) await page.getByRole('button', { name: 'Add parts', exact: true }).click();
  if (await page.getByRole('button', { name: 'Clear part search' }).isVisible()) await page.getByRole('button', { name: 'Clear part search' }).click();
  await page.getByRole('tab', { name: `${family} parts`, exact: true }).click();
}
export async function insertAction(page: Page, action: 'Text' | 'Custom block') {
  if (!await page.getByRole('dialog', { name: 'Parts library', exact: true }).isVisible()) await page.getByRole('button', { name: 'Add parts', exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}
export async function selectionAction(page: Page, action: 'Select all' | 'Deselect all') {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
export async function expectDeselectDisabled(page: Page, disabled: boolean) {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'Deselect all', exact: true });
  if (disabled) await expect(item).toBeDisabled(); else await expect(item).toBeEnabled();
  await page.keyboard.press('Escape');
}
