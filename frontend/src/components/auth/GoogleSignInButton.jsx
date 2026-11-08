import { useEffect, useRef } from 'react';
import { useGoogleOAuth } from '@react-oauth/google';

// The Google sign-in button used on the Login and Register pages.
//
// Google only wants to be set up ONCE per page load. The ready-made
// <GoogleLogin> button sets it up again every time it appears, which
// prints "initialize() is called multiple times" in the console. This
// button sets Google up one time, then only draws the button.
//
// onSuccess gets the same thing <GoogleLogin> gave: { credential: '...' }

let initializedClientId = null;
// The page that is on screen right now gets the sign-in result
let activeHandlers = null;

export default function GoogleSignInButton({ onSuccess, onError, width = 360, text = 'signin_with' }) {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const holderRef = useRef(null);
  const handlersRef = useRef({ onSuccess, onError });
  handlersRef.current = { onSuccess, onError };

  useEffect(() => {
    if (!scriptLoadedSuccessfully || !holderRef.current) return;
    const googleId = window.google?.accounts?.id;
    if (!googleId) return;

    activeHandlers = handlersRef;

    if (initializedClientId !== clientId) {
      googleId.initialize({
        client_id: clientId,
        callback: (response) => {
          const handlers = activeHandlers?.current;
          if (!handlers) return;
          if (response?.credential) {
            handlers.onSuccess?.(response);
          } else {
            handlers.onError?.();
          }
        },
      });
      initializedClientId = clientId;
    }

    holderRef.current.innerHTML = '';
    googleId.renderButton(holderRef.current, {
      type: 'standard',
      shape: 'rectangular',
      text,
      width: Number(width),
    });

    return () => {
      if (activeHandlers === handlersRef) activeHandlers = null;
    };
  }, [scriptLoadedSuccessfully, clientId, width, text]);

  return <div ref={holderRef} />;
}