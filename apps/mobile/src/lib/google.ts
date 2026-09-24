import { signUpWithGoogle } from 'react-native-credentials-manager';

/**
 * "Sign in with Google" through Android Credential Manager (docs/mobile §7.2).
 * Returns Google's signed ID token for the account the person picks; the
 * server verifies it (signature, audience = our web client id, nonce). The app
 * never sees a Google access or refresh token.
 */
export async function pickGoogleAccount(input: {
  webClientId: string;
  nonce: string;
}): Promise<{ idToken: string } | null> {
  try {
    const credential = await signUpWithGoogle({
      serverClientId: input.webClientId,
      nonce: input.nonce,
      autoSelectEnabled: false,
      filterByAuthorizedAccounts: false,
    });
    return { idToken: credential.idToken };
  } catch (error) {
    // The person closed the sheet: not an error worth showing.
    if (isCancellation(error)) return null;
    throw error;
  }
}

function isCancellation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /cancel/iu.test(text);
}
