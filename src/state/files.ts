/** Propose un fichier au téléchargement (export JSON, rappel .ics). */
export function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** Adresse de l'appli (avec son chemin de base, ex. `/hyppo-patrimoine/`). */
export const appUrl = (): string => new URL(import.meta.env.BASE_URL, window.location.origin).href;
