import { redirect } from 'next/navigation';

/**
 * Entry point.
 *
 * The dashboard is the product; there is no marketing surface in front of it
 * and nothing useful this route could show that the dashboard does not.
 */
export default function HomePage() {
  redirect('/dashboard');
}
