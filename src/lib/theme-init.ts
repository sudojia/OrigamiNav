/** Pre-paint script that sets `data-skin` from the admin-configured default. */
export function buildSkinInitScript(serverDefaultSkin: string): string {
  // Escapes backslash and single quote for the single-quoted JS string literal.
  const safe = serverDefaultSkin.replace(/[\\']/g, '\\$&').replace(/\n/g, '\\n');
  return `(function(){document.documentElement.setAttribute('data-skin','${safe}');})();`;
}

/**
 * Pre-paint script setting the admin shell's dark/light class from the
 * persisted key; `forceDark` pins dark-only skins.
 */
export function buildAdminModeInitScript(forceDark = false): string {
  if (forceDark) {
    return (
      `(function(){try{localStorage.removeItem('origaminav.admin-mode');}catch(e){}` +
      `var el=document.currentScript&&document.currentScript.parentElement;if(!el)return;` +
      `el.classList.remove('dark','light');` +
      `el.classList.add('dark');})();`
    );
  }
  return (
    `(function(){var m='dark';try{m=localStorage.getItem('origaminav.admin-mode')||'light';}catch(e){}` +
    `var el=document.currentScript&&document.currentScript.parentElement;if(!el)return;` +
    `el.classList.remove('dark','light');` +
    `el.classList.add(m==='dark'?'dark':'light');})();`
  );
}
