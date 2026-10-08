/** Pre-paint script that sets `data-skin` from the admin-configured default. */
export function buildSkinInitScript(serverDefaultSkin: string): string {
  // Escapes backslash and single quote for the single-quoted JS string literal.
  const safe = serverDefaultSkin.replace(/[\\']/g, '\\$&').replace(/\n/g, '\\n');
  return `(function(){document.documentElement.setAttribute('data-skin','${safe}');})();`;
}

/**
 * Pre-paint script for the root layout (after children): sets the admin
 * shell's dark/light class from the persisted key; `forceDark` pins
 * dark-only skins. No-op when no .admin-shell exists (public pages).
 */
export function buildAdminModeInitScript(forceDark = false): string {
  const read = forceDark
    ? `try{localStorage.removeItem('origaminav.admin-mode');}catch(e){}`
    : `try{if(localStorage.getItem('origaminav.admin-mode')==='dark')m='dark';}catch(e){}`;
  return (
    `(function(){var m='${forceDark ? 'dark' : 'light'}';` +
    read +
    // The shell paints its own tokens; <body> carries the same mode so the
    // portaled surfaces and `dark:` variants resolve against the admin.
    `var el=document.querySelector('.admin-shell');if(!el)return;` +
    `el.classList.remove('dark','light');` +
    `el.classList.add(m);` +
    `document.body.classList.add(m);})();`
  );
}
