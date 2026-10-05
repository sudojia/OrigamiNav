/** Server startup hook: runs migrations and warns when DATABASE_URL is unset. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Loads the Node-only migration runner.
  const { runMigrationsAtBoot } = await import('@/db/migrate');
  runMigrationsAtBoot();

  if (!process.env.DATABASE_URL) {
    console.warn(
      '\n[origaminav] DATABASE_URL is not set.\n' +
        '  Pages will render empty until you configure it. See .env.example.\n',
    );
  }
}
