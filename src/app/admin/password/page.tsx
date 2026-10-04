import { redirect } from 'next/navigation';

/** Redirects to the site settings page. */
export default function AdminPasswordRedirect() {
  redirect('/admin/settings');
}
