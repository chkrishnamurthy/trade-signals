import { redirect } from 'next/navigation';
/** The old Signals page (Confirmed VWAP Trend Pullback) was replaced by /intraday. */
export default function SignalsRedirect() {
  redirect('/intraday');
}
