/**
 * Retour haptique. Safari sur iPhone ne gère pas l'API de vibration :
 * depuis iOS 18, basculer un interrupteur natif (`<input type="checkbox" switch>`) déclenche un léger retour haptique.
 * Ailleurs, on utilise `navigator.vibrate` quand il existe. Sinon, rien (silencieux).
 */
let label: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement {
  if (label) return label;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

export function haptic(kind: 'light' | 'success' = 'light'): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [12, 40, 18] : 10);
      return;
    }
    ensureSwitch().click();
  } catch {
    /* sans retour haptique */
  }
}
